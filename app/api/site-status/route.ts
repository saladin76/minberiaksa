import { NextResponse } from "next/server";
import { readEmergency } from "@/lib/site-security/emergency";

export const dynamic = "force-dynamic";
/** Public, tiny: lets the browser show the donation-pause notice even on cached pages. */
export async function GET() {
  const { mode } = await readEmergency();
  return NextResponse.json({ donationsPaused: mode !== "OFF" }, { headers: { "Cache-Control": "public, max-age=15" } });
}
