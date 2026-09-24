import { auth } from "@/auth";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { applyDailyHolderGrant, consumeWalletChallenge, getCreditUser, linkWallet } from "@/lib/credits";

export async function POST(request: Request) {
  const session = await auth();
  const xUserId = session?.user?.xUserId;
  if (!xUserId) return Response.json({ error: "Connect X first." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { wallet?: unknown; signature?: unknown };
  const wallet = typeof body.wallet === "string" ? body.wallet.trim() : "";
  const signature = Array.isArray(body.signature) ? body.signature : [];
  const message = await consumeWalletChallenge(xUserId, wallet);
  if (!message) return Response.json({ error: "The wallet request expired. Try again." }, { status: 400 });
  try {
    const publicKey = bs58.decode(wallet);
    const bytes = Uint8Array.from(signature.map((value) => Number(value)));
    const valid = publicKey.length === 32 && bytes.length === 64 && nacl.sign.detached.verify(new TextEncoder().encode(message), bytes, publicKey);
    if (!valid) return Response.json({ error: "The wallet signature was not valid." }, { status: 400 });
  } catch {
    return Response.json({ error: "The wallet signature was not valid." }, { status: 400 });
  }
  try {
    await linkWallet(xUserId, wallet);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return Response.json({ error: "This wallet is already linked to another X account." }, { status: 409 });
    throw error;
  }
  const holder = await applyDailyHolderGrant(xUserId, wallet);
  const user = await getCreditUser(xUserId);
  return Response.json({ linked: true, holder, balance: user?.balance.toString() || "0" });
}
