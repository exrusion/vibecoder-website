import { auth } from "@/auth";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import postgres from "postgres";
import bs58 from "bs58";
import nacl from "tweetnacl";

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const sql = process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL, { max: 3, prepare: false }) : null;
let setup: Promise<unknown> | undefined;
function schema() {
  if (!sql) throw new Error("Gate storage is unavailable.");
  setup ??= sql`CREATE TABLE IF NOT EXISTS vibecoder_gates (
    id TEXT PRIMARY KEY, owner_x_id TEXT NOT NULL, name TEXT NOT NULL,
    mint TEXT NOT NULL, minimum TEXT NOT NULL, content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'announcement',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`.catch(error => { setup = undefined; throw error; });
  return setup;
}
function sign(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Gate signing is unavailable.");
  return createHmac("sha256", secret).update(value).digest("hex");
}
function validMac(value: string, mac: string) {
  if (!/^[a-f0-9]{64}$/i.test(mac)) return false;
  return timingSafeEqual(Buffer.from(sign(value), "hex"), Buffer.from(mac, "hex"));
}
type Gate = { id: string; owner_x_id: string; name: string; mint: string; minimum: string; content: string; content_type: string };

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "");
  try {
    await schema();
    if (action === "create") {
      const owner = (await auth())?.user?.xUserId;
      if (!owner) return Response.json({ error: "Connect X to save a holder gate." }, { status: 401 });
      const mint = String(body.mint || "").trim();
      const minimum = String(body.minimum || "").trim();
      const name = String(body.name || "").trim().slice(0, 80);
      const content = String(body.content || "").trim().slice(0, 10000);
      const contentType = ["announcement", "download", "game"].includes(String(body.contentType)) ? String(body.contentType) : "announcement";
      if (!ADDRESS.test(mint) || !/^\d+(?:\.\d{1,9})?$/.test(minimum) || Number(minimum) <= 0 || !name || !content) {
        return Response.json({ error: "Enter a token mint, minimum balance, title, and private content." }, { status: 400 });
      }
      const id = randomUUID();
      await sql!`INSERT INTO vibecoder_gates (id, owner_x_id, name, mint, minimum, content, content_type)
        VALUES (${id}, ${owner}, ${name}, ${mint}, ${minimum}, ${content}, ${contentType})`;
      return Response.json({ id, url: "/gate/" + id }, { status: 201 });
    }
    const id = String(body.id || "");
    const gates = await sql!<Gate[]>`SELECT * FROM vibecoder_gates WHERE id = ${id} LIMIT 1`;
    const gate = gates[0];
    if (!gate) return Response.json({ error: "Gate not found." }, { status: 404 });
    if (action === "details") return Response.json({ id, name: gate.name, mint: gate.mint, minimum: gate.minimum, contentType: gate.content_type });
    const wallet = String(body.wallet || "");
    if (!ADDRESS.test(wallet) || bs58.decode(wallet).length !== 32) return Response.json({ error: "Invalid wallet address." }, { status: 400 });
    if (action === "challenge") {
      const expiry = Date.now() + 5 * 60_000;
      const message = ["Vibekit holder gate", "Gate: " + id, "Wallet: " + wallet, "Nonce: " + randomUUID(), "Expires: " + expiry].join("\n");
      return Response.json({ message, mac: sign(message), expiresAt: expiry });
    }
    if (action !== "unlock") return Response.json({ error: "Unknown gate action." }, { status: 400 });
    const message = String(body.message || "");
    if (!message.startsWith("Vibekit holder gate\nGate: " + id + "\nWallet: " + wallet + "\nNonce: ")
      || !validMac(message, String(body.mac || ""))) return Response.json({ error: "Invalid gate challenge." }, { status: 400 });
    const expiry = Number(message.split("\nExpires: ")[1]);
    if (!Number.isFinite(expiry) || expiry < Date.now() || expiry > Date.now() + 5 * 60_000) return Response.json({ error: "Gate challenge expired." }, { status: 400 });
    const signature = Array.isArray(body.signature) ? Uint8Array.from(body.signature.map(Number)) : new Uint8Array();
    if (signature.length !== 64 || !nacl.sign.detached.verify(new TextEncoder().encode(message), signature, bs58.decode(wallet))) {
      return Response.json({ error: "Wallet signature could not be verified." }, { status: 403 });
    }
    const response = await fetch(process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com", {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(9000),
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner",
        params: [wallet, { mint: gate.mint }, { encoding: "jsonParsed", commitment: "confirmed" }] }),
    });
    if (!response.ok) throw new Error("Solana RPC is unavailable. Please try again.");
    const payload = await response.json() as { error?: { message?: string }; result?: { value?: { account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: string; decimals?: number } } } } } }[] } };
    if (payload.error) throw new Error(payload.error.message || "Solana RPC rejected the balance check.");
    const accounts = payload.result?.value || [];
    const decimals = accounts[0]?.account?.data?.parsed?.info?.tokenAmount?.decimals ?? 0;
    if (decimals < 0 || decimals > 18) throw new Error("Invalid token decimals.");
    const total = accounts.reduce((sum, entry) => sum + BigInt(entry.account?.data?.parsed?.info?.tokenAmount?.amount || "0"), BigInt(0));
    const [whole, fraction = ""] = gate.minimum.split(".");
    const threshold = BigInt(whole) * BigInt(10) ** BigInt(decimals)
      + BigInt((fraction.padEnd(decimals, "0")).slice(0, decimals) || "0");
    if (fraction.length > decimals && /[1-9]/.test(fraction.slice(decimals))) return Response.json({ error: "The configured minimum is below token precision." }, { status: 400 });
    if (total < threshold) return Response.json({ eligible: false, error: "This wallet does not meet the holder minimum." }, { status: 403 });
    return Response.json({ eligible: true, content: gate.content, contentType: gate.content_type, name: gate.name }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Gate check failed." }, { status: 502 });
  }
}
