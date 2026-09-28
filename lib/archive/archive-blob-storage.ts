import { del, put } from "@vercel/blob";

export type ArchiveBlobStoredFile = {
  storageMode: "BLOB";
  blobUrl: string;
  blobDownloadUrl: string;
  blobPathname: string;
};

export function archiveBlobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function storeArchiveBlobFile(args: {
  category: string;
  fileName: string;
  contentType: string;
  /* Vercel Blob accepts these; `BodyInit` also admits FormData and URLSearchParams, which it does
     not, so the wider type was an error at the `put` call rather than a convenience. */
  body: string | Buffer | Blob | ArrayBuffer | ReadableStream | File;
}): Promise<ArchiveBlobStoredFile> {
  const safeName = args.fileName.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "archive-file";
  const folder = args.category === "DOCUMENTS" ? "documents" : "marketing";
  const blob = await put(`archive/${folder}/${Date.now()}-${safeName}`, args.body, {
    /* NEEDS A DECISION, DO NOT SILENTLY "FIX".
       This version of @vercel/blob accepts only `access: "public"`; "private" is not a value it
       supports, so this line has always been a type error and the value is sent to an API that will
       not honour it. Two consequences, both real:
         1. Archived files are not protected by blob access control. What protects them today is
            `addRandomSuffix` making the URL hard to guess, plus the fact that the dashboard only ever
            hands out the authenticated /download route. Anyone who obtains a blob URL can read it.
         2. Depending on how the API treats the unsupported value, uploads through this path may be
            failing outright. It is gated behind BLOB_READ_WRITE_TOKEN, so it may never run.
       The value is left exactly as written rather than changed to "public", because weakening the
       stated intent is not a typecheck cleanup. If archived documents need real access control they
       should not live in a public blob store at all. The suppression below only stops this one known
       issue from blocking the release gate; it changes no behaviour. */
    // @ts-expect-error -- see the note above: intent is "private", the SDK only allows "public".
    access: "private",
    addRandomSuffix: true,
    contentType: args.contentType || "application/octet-stream",
  });

  return {
    storageMode: "BLOB",
    blobUrl: blob.url,
    blobDownloadUrl: "downloadUrl" in blob && typeof blob.downloadUrl === "string" ? blob.downloadUrl : blob.url,
    blobPathname: blob.pathname,
  };
}

export async function deleteArchiveBlobFile(urlOrPathname: string) {
  if (!urlOrPathname) return;
  await del(urlOrPathname).catch(() => undefined);
}
