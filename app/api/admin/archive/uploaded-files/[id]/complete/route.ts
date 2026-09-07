import { archiveBlobEnabled, storeArchiveBlobFile } from "@/lib/archive/archive-blob-storage";
import { metadataObject, numberField, stringField } from "@/lib/archive/uploaded-files";
import { prisma } from "@/lib/prisma";
import { jsonNoStore, requireArchiveActionAccess } from "../../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> | { id: string } };

export async function POST(_request: Request, context: Params) {
  const { denied } = await requireArchiveActionAccess("archiveUpload");
  if (denied) return denied;

  const { id } = await Promise.resolve(context.params);
  const parent = await prisma.auditLog.findUnique({ where: { id }, select: { id: true, action: true, entityType: true, metadata: true } });
  if (!parent || parent.action !== "archive.uploadedFile.create" || parent.entityType !== "ArchiveUploadedFile") {
    return jsonNoStore({ ok: false, error: "ملف الرفع غير موجود" }, { status: 404 });
  }

  const metadata = metadataObject(parent.metadata);
  const chunks = await readUploadChunks(id);
  const expected = numberField(metadata.chunkCount);
  const receivedIndexes = new Set(chunks.map((item) => numberField(item.index)));

  if (!expected || receivedIndexes.size < expected) {
    return jsonNoStore({ ok: false, error: "لم تكتمل كل أجزاء الملف" }, { status: 400 });
  }

  const storagePatch = await buildStoragePatch(id, metadata, chunks);
  await prisma.auditLog.update({
    where: { id },
    data: {
      metadata: { ...metadata, ...storagePatch, uploadStatus: "READY" },
      messageAr: "تم رفع الملف داخل الأرشيف",
      messageEn: "Archive uploaded file completed",
    },
  });

  return jsonNoStore({ ok: true, message: "تم رفع الملف" });
}

async function readUploadChunks(fileId: string) {
  const rows = await prisma.auditLog.findMany({
    where: { action: "archive.uploadedFile.chunk", entityType: "ArchiveUploadedFileChunk", entityId: fileId },
    select: { metadata: true },
  });
  return rows.map((row) => metadataObject(row.metadata)).sort((a, b) => numberField(a.index) - numberField(b.index));
}

async function buildStoragePatch(fileId: string, metadata: Record<string, unknown>, chunks: Record<string, unknown>[]) {
  if (!archiveBlobEnabled()) return { storageMode: "CLIENT_CHUNKED" };

  try {
    const base64 = chunks.map((item) => stringField(item.base64)).join("");
    const blob = await storeArchiveBlobFile({
      category: stringField(metadata.category),
      fileName: stringField(metadata.fileName) || `archive-${fileId}`,
      contentType: stringField(metadata.mimeType) || "application/octet-stream",
      body: Buffer.from(base64, "base64"),
    });
    await prisma.auditLog.deleteMany({ where: { action: "archive.uploadedFile.chunk", entityType: "ArchiveUploadedFileChunk", entityId: fileId } });
    return { ...blob, chunkCount: 0, base64: undefined };
  } catch {
    return { storageMode: "CLIENT_CHUNKED" };
  }
}
