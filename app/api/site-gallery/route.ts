import { NextResponse } from "next/server";
import { publicGallery } from "@/lib/site-gallery/store";

export const dynamic = "force-dynamic";
/** Public: the visible "field moments" images. An error shows no gallery rather than a broken page. */
export async function GET() {
  const images = await publicGallery().catch(() => []);
  return NextResponse.json({ images }, { headers: { "Cache-Control": "public, max-age=60" } });
}
