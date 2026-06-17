import type { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID || "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope: "identify",
        },
      },
    }),
  ],

  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        const discordProfile = profile as { id?: string };
        token.discordId = discordProfile.id;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.discordId;
      }

      return session;
    },
  },
};