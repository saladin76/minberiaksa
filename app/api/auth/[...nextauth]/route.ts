import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "./options";

/**
 * NextAuth v4's default export expects `context.params` so it can choose the App Router
 * handler. On Next.js 16, `params` may be missing or only available as a Promise in a
 * shape the built-in guard does not treat as "App Router", which falls through to the
 * Pages handler and breaks `/api/auth/*` (404 / failed OAuth).
 */
const nextAuth = NextAuth(authOptions);

type NextAuthCatchAll = { nextauth?: string[] };

function segmentsFromRequestUrl(req: NextRequest): string[] {
  const pathname = new URL(req.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const authIdx = parts.indexOf("auth");
  if (authIdx === -1 || authIdx >= parts.length - 1) return [];
  return parts.slice(authIdx + 1);
}

async function resolveNextAuthParams(
  req: NextRequest,
  ctx: { params?: NextAuthCatchAll | Promise<NextAuthCatchAll> }
): Promise<NextAuthCatchAll> {
  const raw = ctx.params;
  let resolved: NextAuthCatchAll | undefined;
  if (raw != null) {
    resolved =
      typeof (raw as Promise<NextAuthCatchAll>).then === "function"
        ? await (raw as Promise<NextAuthCatchAll>)
        : (raw as NextAuthCatchAll);
  }
  if (resolved?.nextauth?.length) return resolved;
  return { nextauth: segmentsFromRequestUrl(req) };
}

export async function GET(
  req: NextRequest,
  ctx: { params?: NextAuthCatchAll | Promise<NextAuthCatchAll> }
) {
  const params = await resolveNextAuthParams(req, ctx);
  return nextAuth(req, { params } as { params: NextAuthCatchAll });
}

export async function POST(
  req: NextRequest,
  ctx: { params?: NextAuthCatchAll | Promise<NextAuthCatchAll> }
) {
  const params = await resolveNextAuthParams(req, ctx);
  return nextAuth(req, { params } as { params: NextAuthCatchAll });
}
