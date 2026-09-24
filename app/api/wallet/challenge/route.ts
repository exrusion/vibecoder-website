import { auth } from "@/auth";
import bs58 from "bs58";
import { createWalletChallenge } from "@/lib/credits";

export async function POST(request: Request) {
  const session = await auth();
  const xUserId = session?.user?.xUserId;
  if (!xUserId) return Response.json({ error: "Connect X first." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { wallet?: unknown };
  const wallet = typeof body.wallet === "string" ? body.wallet.trim() : "";
  try {
    if (bs58.decode(wallet).length !== 32) throw new Error("Invalid address");
  } catch {
    return Response.json({ error: "Enter a valid Solana wallet." }, { status: 400 });
  }
  return Response.json(await createWalletChallenge(xUserId, wallet));
}
