import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { archiveBlobEnabled, storeArchiveBlobFile } from "@/lib/archive/archive-blob-storage";
import { getArchiveRepositorySnapshot } from "@/lib/archive/archive-repository";
import { foundationArchiveData } from "@/lib/archive/archive-service";
import {
  ARCHIVE_BASE64_CHUNK_SIZE,
  ARCHIVE_MAX_FILE_BYTES,
  archiveExtension,
  archiveUploadMessage,
  archiveUploadMessageEn,
  buildArchiveUploadReferences,
  chunkString,
  defaultArchiveFileCategory,
  isAllowedArchiveFile,
  mimeFromArchiveExtension,
  parseArchiveUploadCategory,
  toArchiveUploadedFileItem,
  validArchiveCollectionId,
  validArchiveProjectId,
  type ArchiveUploadCategory,
  type ArchiveUploadedFileItem,
} from "@/lib/archive/uploaded-files";
import { prisma } from "@/lib/prisma";
import { jsonNoStore, requireArchiveActionAccess, requireArchiveUploadedFileListAccess } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const category = parseArchiveUploadCategory(new URL(request.url).searchParams.get("category"));
  if (!category) return jsonNoStore({ ok: false, error: "Invalid category" }, { status: 400 });

  const { denied } = await requireArchiveUploadedFileListAccess(category);
  if (denied) return denied;

  const snapshot = await getArchiveRepositorySnapshot(foundationArchiveData());
  const references = buildArchiveUploadReferences(snapshot.collections, snapshot.projects);
  const rows = await prisma.auditLog.findMany({
    where: { action: "archive.uploadedFile.create", entityType: "ArchiveUploadedFile" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, createdAt: true, actorName: true, metadata: true },
  });

  const files = rows
    .map((row) => toArchiveUploadedFileItem(row, references))
    .filter((file): file is ArchiveUploadedFileItem => Boolean(file) && file.category === category);

  return jsonNoStore({ ok: true, files, references, storage: { blobEnabled: archiveBlobEnabled() } });
}

export async function POST(request: Request) {
  const { session, denied } = await requireArchiveActionAccess("archiveUpload");
  if (denied) return denied;
  if (!session?.user) return jsonNoStore({ ok: false, error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const category = parseArchiveUploadCategory(String(formData.get("category") || ""));
  const file = formData.get("file");
  const title = String(formData.get("title") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!category) return jsonNoStore({ ok: false, error: "اختر نوع الملف" }, { status: 400 });
  if (category === "DOCUMENTS") {
    const docsAccess = await requireArchiveUploadedFileListAccess("DOCUMENTS");
    if (docsAccess.denied) return docsAccess.denied;
  }
  if (!(file instanceof File)) return jsonNoStore({ ok: false, error: "اختر ملفًا أولًا" }, { status: 400 });
  if (file.size <= 0) return jsonNoStore({ ok: false, error: "الملف فارغ" }, { status: 400 });
  if (file.size > ARCHIVE_MAX_FILE_BYTES) return jsonNoStore({ ok: false, error: "حجم الملف كبير جدًا. الحد الحالي 30MB" }, { status: 400 });

  const extension = archiveExtension(file.name);
  if (!isAllowedArchiveFile(extension, file.type)) {
    return jsonNoStore({ ok: false, error: "الملفات المسموحة PDF أو Excel فقط" }, { status: 400 });
  }

  const snapshot = await getArchiveRepositorySnapshot(foundationArchiveData());
  const references = buildArchiveUploadReferences(snapshot.collections, snapshot.projects);
  const linkedCollectionId = validArchiveCollectionId(String(formData.get("linkedCollectionId") || ""), references);
  const linkedProjectId = validArchiveProjectId(String(formData.get("linkedProjectId") || ""), references);
  const actor = auditActorFromDashboardSession(session);
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || mimeFromArchiveExtension(extension);
  const blob = await tryStoreBlob({ category, fileName: file.name, mimeType, buffer });
  const base64 = blob ? "" : buffer.toString("base64");
  const chunks = blob ? [] : chunkString(base64, ARCHIVE_BASE64_CHUNK_SIZE);

  const row = await prisma.auditLog.create({
    data: {
      ...actor,
      action: "archive.uploadedFile.create",
      messageAr: archiveUploadMessage(category, "direct"),
      messageEn: archiveUploadMessageEn(category, "direct"),
      entityType: "ArchiveUploadedFile",
      metadata: {
        category,
        title: title || file.name,
        notes: notes || undefined,
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
        extension,
        linkedCollectionId,
        linkedProjectId,
        fileCategory: defaultArchiveFileCategory(category),
        reviewStatus: "NEW",
        storageMode: blob?.storageMode || (chunks.length > 1 ? "CHUNKED" : "INLINE"),
        blobUrl: blob?.blobUrl,
        blobDownloadUrl: blob?.blobDownloadUrl,
        blobPathname: blob?.blobPathname,
        chunkCount: blob ? 0 : chunks.length,
        uploadStatus: "READY",
        base64: !blob && chunks.length === 1 ? base64 : undefined,
      },
      stream: "TEAM",
    },
  });

  if (!blob && chunks.length > 1) {
    await saveArchiveChunks(row.id, chunks, actor);
  }

  return jsonNoStore({ ok: true, file: toArchiveUploadedFileItem(row, references), message: "تم رفع الملف" });
}

async function saveArchiveChunks(fileId: string, chunks: string[], actor: ReturnType<typeof auditActorFromDashboardSession>) {
  for (let index = 0; index < chunks.length; index += 1) {
    await prisma.auditLog.create({
      data: {
        ...actor,
        action: "archive.uploadedFile.chunk",
        messageAr: "تم حفظ جزء من ملف أرشيفي",
        messageEn: "Archive uploaded file chunk saved",
        entityType: "ArchiveUploadedFileChunk",
        entityId: fileId,
        metadata: { fileId, index, total: chunks.length, base64: chunks[index] },
        stream: "TEAM",
      },
    });
  }
}

async function tryStoreBlob(args: { category: ArchiveUploadCategory; fileName: string; mimeType: string; buffer: Buffer }) {
  if (!archiveBlobEnabled()) return null;
  try {
    return await storeArchiveBlobFile({ category: args.category, fileName: args.fileName, contentType: args.mimeType, body: args.buffer });
  } catch {
    return null;
  }
}
