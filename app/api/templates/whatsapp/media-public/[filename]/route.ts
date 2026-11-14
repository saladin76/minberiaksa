import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { templateMediaAbsolutePath, templateMediaMime } from "@/lib/communication/whatsapp-template-media-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opaque public URL for non-personal WhatsApp template headers. Meta must be
 * able to download the original asset without a dashboard cookie/token.
 */
export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }): Promise<Response> {
  const { filename } = await context.params;
  const mime = templateMediaMime(filename);
  if (!mime) return new Response(null, { status: 404 });
  let path: string | null;
  try { path = templateMediaAbsolutePath(filename); } catch { return new Response(null, { status: 404 }); }
  if (!path) return new Response(null, { status: 404 });
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size <= 0 || info.size > 100 * 1024 * 1024) return new Response(null, { status: 404 });
    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(info.size),
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
