import { auth } from "@/auth";
import { applyDailyHolderGrant, DAILY_HOLDER_CREDITS, getCreditUser, HOLDER_THRESHOLD_TOKENS, X_WELCOME_CREDITS } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = Boolean(process.env.AUTH_TWITTER_ID && process.env.AUTH_TWITTER_SECRET);
  const session = await auth();
  const xUserId = session?.user?.xUserId;
  if (!xUserId) return Response.json({ authenticated: false, configured });

  let user = await getCreditUser(xUserId);
  if (!user) return Response.json({ authenticated: false, configured }, { status: 401 });
  let holder = {
    configured: Boolean(process.env.VIBEKIT_TOKEN_MINT || process.env.VIBECODER_TOKEN_MINT),
    eligible: false,
    holding: "0",
    threshold: HOLDER_THRESHOLD_TOKENS.toString(),
    granted: false,
    claimedToday: false,
  };
  if (user.walletAddress) {
    holder = await applyDailyHolderGrant(xUserId, user.walletAddress);
    if (holder.granted) user = (await getCreditUser(xUserId)) || user;
  }
  return Response.json({
    authenticated: true,
    configured,
    user: {
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      walletAddress: user.walletAddress,
      balance: user.balance.toString(),
      lifetimeSpent: user.lifetimeSpent.toString(),
      lastHolderClaim: user.lastHolderClaim,
    },
    grants: {
      welcome: X_WELCOME_CREDITS.toString(),
      dailyHolder: DAILY_HOLDER_CREDITS.toString(),
      holderThreshold: HOLDER_THRESHOLD_TOKENS.toString(),
    },
    holder,
  });
}
