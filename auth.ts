import type { NextAuthOptions, Session } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { hasApprovedAdmins, isApprovedAdminEmail } from "./app/admin-access";

export function isGoogleAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.NEXTAUTH_SECRET &&
      hasApprovedAdmins(),
  );
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "not-configured",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "not-configured",
    }),
  ],
  pages: { signIn: "/admin/sign-in", error: "/admin/sign-in" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    signIn({ user }) {
      return isApprovedAdminEmail(user.email);
    },
  },
};

export async function getAdminSession(): Promise<Session | null> {
  const session = await getServerSession(authOptions);
  return isApprovedAdminEmail(session?.user?.email) ? session : null;
}

export async function requireAdminApi() {
  const session = await getAdminSession();
  if (!session?.user?.email) {
    return { response: Response.json({ error: "Administrator sign-in is required." }, { status: 401 }) } as const;
  }
  return { session, email: session.user.email.toLowerCase() } as const;
}
