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
  body: BodyInit | Buffer;
}): Promise<ArchiveBlobStoredFile> {
  const safeName = args.fileName.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "archive-file";
  const folder = args.category === "DOCUMENTS" ? "documents" : "marketing";
  const blob = await put(`archive/${folder}/${Date.now()}-${safeName}`, args.body, {
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
