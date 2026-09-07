import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { getArchiveRepositorySnapshot } from "@/lib/archive/archive-repository";
import { foundationArchiveData } from "@/lib/archive/archive-service";
import {
  ARCHIVE_MAX_FILE_BYTES,
  archiveExtension,
  archiveUploadMessage,
  archiveUploadMessageEn,
  buildArchiveUploadReferences,
  defaultArchiveFileCategory,
  isAllowedArchiveFile,
  parseArchiveUploadCategory,
  validArchiveCollectionId,
  validArchiveProjectId,
} from "@/lib/archive/uploaded-files";
import { prisma } from "@/lib/prisma";
import { jsonNoStore, requireArchiveActionAccess, requireArchiveUploadedFileListAccess } from "../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { session, denied } = await requireArchiveActionAccess("archiveUpload");
  if (denied) return denied;
  if (!session?.user) return jsonNoStore({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const category = parseArchiveUploadCategory(String(body?.category || ""));
  const fileName = String(body?.fileName || "").trim();
  const title = String(body?.title || "").trim();
  const notes = String(body?.notes || "").trim();
  const mimeType = String(body?.mimeType || "application/octet-stream").trim();
  const sizeBytes = Number(body?.sizeBytes || 0);
  const totalChunks = Number(body?.totalChunks || 0);
  const extension = archiveExtension(fileName);

  if (!category) return jsonNoStore({ ok: false, error: "اختر نوع الملف" }, { status: 400 });
  if (category === "DOCUMENTS") {
    const docsAccess = await requireArchiveUploadedFileListAccess("DOCUMENTS");
    if (docsAccess.denied) return docsAccess.denied;
  }
  if (!fileName) return jsonNoStore({ ok: false, error: "اسم الملف غير واضح" }, { status: 400 });
  if (!isAllowedArchiveFile(extension, mimeType)) return jsonNoStore({ ok: false, error: "الملفات المسموحة PDF أو Excel فقط" }, { status: 400 });
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return jsonNoStore({ ok: false, error: "حجم الملف غير صحيح" }, { status: 400 });
  if (sizeBytes > ARCHIVE_MAX_FILE_BYTES) return jsonNoStore({ ok: false, error: "حجم الملف كبير جدًا. الحد الحالي 30MB" }, { status: 400 });
  if (!Number.isInteger(totalChunks) || totalChunks <= 0 || totalChunks > 40) return jsonNoStore({ ok: false, error: "عدد أجزاء الملف غير صحيح" }, { status: 400 });

  const snapshot = await getArchiveRepositorySnapshot(foundationArchiveData());
  const references = buildArchiveUploadReferences(snapshot.collections, snapshot.projects);
  const linkedCollectionId = validArchiveCollectionId(String(body?.linkedCollectionId || ""), references);
  const linkedProjectId = validArchiveProjectId(String(body?.linkedProjectId || ""), references);

  const actor = auditActorFromDashboardSession(session);
  const row = await prisma.auditLog.create({
    data: {
      ...actor,
      action: "archive.uploadedFile.create",
      messageAr: archiveUploadMessage(category, "started"),
      messageEn: archiveUploadMessageEn(category, "started"),
      entityType: "ArchiveUploadedFile",
      metadata: {
        category,
        title: title || fileName,
        notes: notes || undefined,
        fileName,
        mimeType,
        sizeBytes,
        extension,
        linkedCollectionId,
        linkedProjectId,
        fileCategory: defaultArchiveFileCategory(category),
        reviewStatus: "NEW",
        storageMode: "CLIENT_CHUNKED",
        chunkCount: totalChunks,
        uploadStatus: "UPLOADING",
      },
      stream: "TEAM",
    },
  });

  return jsonNoStore({ ok: true, uploadId: row.id });
}
