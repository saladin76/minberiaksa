import { NextRequest, NextResponse } from "next/server";
export function requireLoginOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expected = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : request.nextUrl.origin;
  return origin !== expected || !request.headers.get("content-type")?.includes("application/json")
    ? NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 }) : null;
}
export function loginError(error: unknown) {
  const reason = error instanceof Error ? error.message : "UNAVAILABLE";
  const safe = ["INVALID_CONTACT", "RATE_LIMITED", "INVALID_CODE", "ACCOUNT_CONFLICT", "DELIVERY_UNAVAILABLE"].includes(reason) ? reason : "UNAVAILABLE";
  return NextResponse.json({ error: safe }, { status: safe === "RATE_LIMITED" ? 429 : safe === "UNAVAILABLE" || safe === "DELIVERY_UNAVAILABLE" ? 503 : 400 });
}
