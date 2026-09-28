import "server-only";

import { NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { receiptExtension } from "@/lib/uploads/receipt-file-rules";

/** The stored fields of one uploaded transfer receipt that serving it needs. */
export interface StoredReceiptFile {
  url: string;
  publicId: string | null;
  resourceType: string | null;
  mimeType: string;
  fileName: string;
}

/**
 * One uploaded transfer receipt as an HTTP response, with its real type and
 * the donor's original name. Shared by the dashboard route and the donor's.
 *
 * The bytes come through Cloudinary's signed download API, not the public
 * URL: the account blocks public delivery of PDFs ("deny or ACL failure"),
 * and raw files are served as `application/octet-stream` with a forced
 * download anyway, so neither viewer could show them.
 */
export async function receiptFileResponse(file: StoredReceiptFile, opts: { download: boolean; logTag: string }): Promise<NextResponse> {
  const source = file.publicId
    ? cloudinary.utils.private_download_url(file.publicId, "", { resource_type: file.resourceType || "raw", type: "upload" })
    : file.url;
  const upstream = await fetch(source, { cache: "no-store" }).catch(() => null);
  if (!upstream?.ok || !upstream.body) {
    console.error("[transfer-receipts] file fetch failed", opts.logTag, upstream?.status, upstream?.headers.get("x-cld-error"));
    return NextResponse.json({ error: "UPSTREAM" }, { status: 502 });
  }

  const base = (file.fileName || "receipt").replace(/\.[^.]+$/, "") || "receipt";
  const name = `${base}${receiptExtension(file.mimeType, file.fileName)}`;
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": `${opts.download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
