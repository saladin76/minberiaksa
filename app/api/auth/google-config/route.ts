import { NextResponse } from "next/server";

/**
 * Exposes the Google OAuth client ID to the browser so client-side Google
 * Identity Services (GSI) can initialize with it. The client ID is *not*
 * a secret — it's part of every Google OAuth URL — so this is safe to ship.
 * The client *secret* never leaves the server.
 */
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "google_client_id_missing" }, { status: 500 });
  }
  const res = NextResponse.json({ clientId });
  res.headers.set("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=600");
  return res;
}
