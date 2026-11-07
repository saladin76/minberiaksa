import { NextResponse } from "next/server";
import { openLocalWhatsappTemplateMedia } from "@/lib/communication/whatsapp-template-media-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const media = await openLocalWhatsappTemplateMedia(id);
  if (!media) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new NextResponse(media.body, {
    headers: {
      "Content-Type": media.type,
      "Content-Length": String(media.bytes),
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
