/** Accept only a real PDF, so an expired session/error page never becomes a
 * misleading .pdf download. Fetch keeps same-origin owner-session cookies. */
export async function fetchDocument(url: string, fallback: string, request: typeof fetch = fetch) {
  const response = await request(url, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(75_000) });
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("application/pdf")) throw new Error("DOCUMENT_DOWNLOAD_FAILED");
  const blob = await response.blob();
  if (await blob.slice(0, 5).text() !== "%PDF-") throw new Error("INVALID_DOCUMENT");
  const disposition = response.headers.get("content-disposition") ?? "";
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  let filename = /filename="([^"]+)"/i.exec(disposition)?.[1] || fallback;
  if (utf8) { try { filename = decodeURIComponent(utf8); } catch { /* Use ASCII fallback. */ } }
  filename = filename.replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(0, 220);
  if (!/\.pdf$/i.test(filename)) filename = fallback;
  return { blob, filename };
}

export function saveDocument({ blob, filename }: Awaited<ReturnType<typeof fetchDocument>>) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = filename; document.body.appendChild(link);
  link.click(); link.remove();
  // Safari may still be reading the URL after click returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
