import NextAuth, { type DefaultSession } from "next-auth";
import Twitter from "next-auth/providers/twitter";
import { ensureTwitterUser } from "@/lib/credits";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { xUserId: string };
  }
}

function twitterProfile(profile: unknown) {
  const value = profile as { data?: { username?: string; name?: string; profile_image_url?: string } } | undefined;
  return value?.data || {};
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Twitter],
  trustHost: true,
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider !== "twitter") return false;
      const details = twitterProfile(profile);
      await ensureTwitterUser({
        xUserId: account.providerAccountId,
        username: details.username,
        displayName: details.name || user.name || "",
        avatarUrl: details.profile_image_url || user.image || "",
      });
      return true;
    },
    async jwt({ token, account }) {
      if (account?.provider === "twitter") (token as typeof token & { xUserId?: string }).xUserId = account.providerAccountId;
      return token;
    },
    async session({ session, token }) {
      session.user.xUserId = String((token as typeof token & { xUserId?: string }).xUserId || "");
      return session;
    },
  },
});
