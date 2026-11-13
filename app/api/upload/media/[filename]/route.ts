import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { Readable } from "node:stream";
import { imageMediaType, imagePath } from "@/lib/uploads/vps-public-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only immutable opaque image filenames can be served, never arbitrary paths. */
export async function GET(_req: Request, context: { params: Promise<{ filename: string }> }): Promise<Response> {
  const { filename } = await context.params;
  const mime = imageMediaType(filename);
  if (!mime) return new Response(null, { status: 404 });
  let target: string | null;
  try { target = imagePath(filename); } catch { return new Response(null, { status: 404 }); }
  if (!target) return new Response(null, { status: 404 });
  try {
    const item = await lstat(target);
    if (!item.isFile() || item.isSymbolicLink() || item.size < 1 || item.size > 8 * 1024 * 1024) return new Response(null, { status: 404 });
    return new Response(Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(item.size),
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": "inline",
      },
    });
  } catch { return new Response(null, { status: 404 }); }
}
