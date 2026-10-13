import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { verifyToken } from "@/lib/otp";
import { isValidLocale, DEFAULT_LOCALE, type SupportedLocale } from "@/lib/locales";
import { completionData, findUserByEmail } from "@/lib/users/account-claim";

const googleAuthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * NextAuth's signIn callback doesn't receive the request, so we read the
 * locale from the next-intl cookie. Falls back to ar.
 */
async function readLocaleFromCookies(): Promise<SupportedLocale> {
  try {
    const c = (await cookies()).get("NEXT_LOCALE")?.value?.toLowerCase().trim();
    if (c && isValidLocale(c)) return c;
  } catch {
    // calling cookies() outside a request scope throws  fall through to default
  }
  return DEFAULT_LOCALE;
}

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('Missing Google OAuth Credentials');
}

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('Missing NEXTAUTH_SECRET');
}

const providers: NextAuthOptions["providers"] = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    authorization: {
      params: {
        prompt: "select_account",
        access_type: "offline",
        response_type: "code"
      }
    },
    allowDangerousEmailAccountLinking: true,
  }),
];

if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
  providers.push(
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

providers.push(
  CredentialsProvider({
    id: "google-onetap",
    name: "Google",
    credentials: {
      idToken: { label: "Google ID Token", type: "text" },
    },
    async authorize(credentials) {
      const idToken = credentials?.idToken;
      if (!idToken) return null;

      let payload: TokenPayload | undefined;
      try {
        const ticket = await googleAuthClient.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      } catch (e) {
        console.error("[google-onetap] verifyIdToken failed", e);
        return null;
      }
      if (!payload?.email || !payload.email_verified) return null;

      const email = payload.email.toLowerCase();
      const name = payload.name ?? "Google User";
      const image = payload.picture ?? null;

      // An imported donor coming back is the same person: complete their
      // record with what Google says, never replace it (`account-claim.ts`).
      const existing = await findUserByEmail(email);
      if (existing) {
        const updateData = completionData(existing, {
          name: payload.name ?? null,
          image,
          preferredLang: existing.preferredLang ? null : await readLocaleFromCookies(),
        });
        if (!existing.emailVerified) updateData.emailVerified = new Date();
        if (Object.keys(updateData).length) await prisma.user.update({ where: { id: existing.id }, data: updateData });
        return {
          id: existing.id,
          email: existing.email,
          name: existing.name ?? name,
          role: existing.role,
        };
      }

      const preferredLang = await readLocaleFromCookies();
      const created = await prisma.user.create({
        data: {
          email,
          name,
          image,
          role: "DONOR",
          emailVerified: new Date(),
          verifiedAt: new Date(),
          preferredLang,
        },
      });
      return { id: created.id, email: created.email, name: created.name, role: created.role };
    },
  })
);

providers.push(
  CredentialsProvider({
    id: "credentials",
    name: "Email & Password",
    credentials: {
      email:           { label: "Email",           type: "email" },
      password:        { label: "Password",        type: "password" },
      autoSignInToken: { label: "Auto Sign-In Token", type: "text" },
    },
    async authorize(credentials) {
      if (!credentials?.email) return null;

      const email = credentials.email.toLowerCase().trim();

      // ── Auto-sign-in path (post email verification) ──────────────────────
      if (credentials.autoSignInToken) {
        const result = await verifyToken(email, credentials.autoSignInToken, "AUTO_SIGN_IN");
        if (!result.success) return null;

        const user = await findUserByEmail(email);
        if (!user) return null;
        if (!user.verifiedAt) await prisma.user.update({ where: { id: user.id }, data: { verifiedAt: new Date() } });

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      }

      // ── Normal password path ──────────────────────────────────────────────
      if (!credentials.password) return null;

      const user = await findUserByEmail(email);
      if (!user) return null;
      // Imported from the old site (or Google-only): there is no password to
      // check. The dialog sends them to sign-up, which claims this account.
      if (!user.password) throw new Error("NO_PASSWORD");

      if (!user.emailVerified) throw new Error("EMAIL_NOT_VERIFIED");

      const valid = await bcrypt.compare(credentials.password, user.password);
      if (!valid) return null;
      if (!user.verifiedAt) await prisma.user.update({ where: { id: user.id }, data: { verifiedAt: new Date() } });

      return { id: user.id, email: user.email, name: user.name, role: user.role };
    },
  })
);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
  providers,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        // Credentials  authorize() already validated the user
        if (account?.type === "credentials") return true;

        if (account && profile && user.email) {
          // The provider's email decides who this is. A donor imported from the
          // old site signs straight into that record (the adapter links the
          // provider to it by email); what the provider knows only fills the
          // fields that are still empty, so their donor name is kept.
          // Lowercased here and in `findUserByEmail` so the adapter's own
          // exact lookup finds the same record.
          const email = user.email.toLowerCase();
          user.email = email;
          const existingUser = await findUserByEmail(email);

          if (existingUser) {
            const updateData = completionData(existingUser, {
              name: user.name ?? null,
              image: user.image ?? null,
              preferredLang: existingUser.preferredLang ? null : await readLocaleFromCookies(),
            });
            // Google and Facebook only hand over addresses they have confirmed.
            if (!existingUser.emailVerified) updateData.emailVerified = new Date();
            if (Object.keys(updateData).length) {
              await prisma.user.update({ where: { id: existingUser.id }, data: updateData });
            }
          } else {
            const preferredLang = await readLocaleFromCookies();
            await prisma.user.create({
              data: {
                email,
                name: user.name ?? null,
                image: user.image,
                role: 'DONOR', // Default role
                emailVerified: new Date(),
                verifiedAt: new Date(),
                preferredLang,
              },
            });
          }
          return true;
        }
        return false;
      } catch (error) {
        console.error('Error in signIn callback:', error);
        return false;
      }
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.sub!;
        session.user.email = token.email;
        
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { role: true, dashboardPermissions: true },
          });
          
          if (dbUser) {
            session.user.role = dbUser.role;
            session.user.dashboardPermissions = dbUser.dashboardPermissions ?? [];
          }
        } catch (error) {
          console.error('Error fetching user role:', error);
        }
      }
      return session;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.role = user.role as "ADMIN" | "DONOR" | "STAFF" | undefined;
        token.email = user.email;
        token.dashboardPermissions = (user as { dashboardPermissions?: string[] }).dashboardPermissions ?? [];
      }
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    }
  }
};