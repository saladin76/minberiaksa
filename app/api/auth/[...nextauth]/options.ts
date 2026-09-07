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
    // calling cookies() outside a request scope throws — fall through to default
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

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        const updateData: Record<string, unknown> = { name, image };
        if (!existing.preferredLang) {
          updateData.preferredLang = await readLocaleFromCookies();
        }
        await prisma.user.update({ where: { id: existing.id }, data: updateData });
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

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      }

      // ── Normal password path ──────────────────────────────────────────────
      if (!credentials.password) return null;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.password) return null;

      if (!user.emailVerified) throw new Error("EMAIL_NOT_VERIFIED");

      const valid = await bcrypt.compare(credentials.password, user.password);
      if (!valid) return null;

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
        // Credentials — authorize() already validated the user
        if (account?.type === "credentials") return true;

        if (account && profile) {
          // Check if the user already exists
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email! },
          });

          if (existingUser) {
            // If the user exists, update their information.
            // Backfill preferredLang from the cookie ONLY if it's still null —
            // never overwrite an explicit choice the user has already made.
            const updateData: Record<string, unknown> = {
              name: user.name!,
              image: user.image,
            };
            if (!existingUser.preferredLang) {
              updateData.preferredLang = await readLocaleFromCookies();
            }
            await prisma.user.update({
              where: { email: user.email! },
              data: updateData,
            });
          } else {
            // If the user does not exist, create a new user
            const preferredLang = await readLocaleFromCookies();
            await prisma.user.create({
              data: {
                email: user.email!,
                name: user.name!,
                image: user.image,
                role: 'DONOR', // Default role
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