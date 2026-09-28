import { prisma } from "@/lib/prisma";
import { jsonNoStore, requireArchiveApiAccess, requireArchiveUploadedFileListAccess } from "../../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> | { id: string } };

export async function GET(_request: Request, context: Params) {
  const { denied } = await requireArchiveApiAccess();
  if (denied) return denied;

  const { id } = await Promise.resolve(context.params);
  const parent = await prisma.auditLog.findUnique({ where: { id }, select: { id: true, action: true, entityType: true, metadata: true } });
  if (!parent || parent.action !== "archive.uploadedFile.create" || parent.entityType !== "ArchiveUploadedFile") {
    return jsonNoStore({ ok: false, error: "الملف غير موجود" }, { status: 404 });
  }

  const metadata = metadataObject(parent.metadata);
  if (stringField(metadata.category) === "DOCUMENTS") {
    const docsAccess = await requireArchiveUploadedFileListAccess("DOCUMENTS");
    if (docsAccess.denied) return docsAccess.denied;
  }

  const rows = await prisma.auditLog.findMany({
    where: {
      OR: [
        { id },
        { entityId: id },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    /* AuditLog has no `actorEmail` column  only `actorId` and `actorName`. Selecting it was a type
       error and reading it below always produced undefined, so the actor fallback never ran. */
    select: { id: true, action: true, messageAr: true, messageEn: true, actorName: true, createdAt: true },
  });

  return jsonNoStore({
    ok: true,
    activity: rows.map((row) => ({
      id: row.id,
      action: row.action,
      message: row.messageAr || row.messageEn || row.action,
      actor: row.actorName || "الفريق",
      createdAt: row.createdAt.toISOString(),
    })),
  });
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}
