import { z } from "zod";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { createArchiveDriveLinkInRepository } from "@/lib/archive/archive-mutation-service";
import { extractDriveIds, getArchiveSnapshotDbBacked } from "@/lib/archive/archive-service";
import { prisma } from "@/lib/prisma";
import { jsonNoStore, readJson, requireArchiveApiAccess } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const objectIdPattern = /^[a-f\d]{24}$/i;
const googleDriveHostnames = new Set(["drive.google.com"]);

type ArchiveDriveLinkDelegate = {
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<{ id: string; title: string; driveUrl: string; projectId: string }>;
  delete(args: { where: { id: string } }): Promise<{ id: string; title: string; driveUrl: string; projectId: string }>;
};

type ArchiveOptionalDelegates = {
  archiveDriveLink?: ArchiveDriveLinkDelegate;
};

function isRuntimeId(id: string) {
  return objectIdPattern.test(id);
}

function driveLinkDelegate() {
  return (prisma as unknown as ArchiveOptionalDelegates).archiveDriveLink ?? null;
}

function isGoogleDriveUrl(value: string) {
  try {
    const url = new URL(value);
    return googleDriveHostnames.has(url.hostname) || url.hostname.endsWith(".drive.google.com");
  } catch {
    return false;
  }
}

const schema = z.object({
  projectId: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(180),
  driveUrl: z.string().trim().min(1).max(1200).refine(isGoogleDriveUrl, "Drive URL must be a valid Google Drive URL."),
});

const updateSchema = schema.extend({
  id: z.string().trim().min(1),
});

const deleteSchema = z.object({
  id: z.string().trim().min(1),
});

export async function GET() {
  const { denied } = await requireArchiveApiAccess();
  if (denied) return denied;
  const snapshot = await getArchiveSnapshotDbBacked();
  return jsonNoStore({ ok: true, persistence: snapshot.persistence, driveLinks: snapshot.driveLinks });
}

export async function POST(request: Request) {
  const { session, denied } = await requireArchiveApiAccess();
  if (denied) return denied;

  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return jsonNoStore({ ok: false, error: "Invalid archive Drive link payload", issues: parsed.error.flatten() }, { status: 400 });

  const snapshot = await getArchiveSnapshotDbBacked();
  const projectExists = snapshot.projects.some((project) => project.id === parsed.data.projectId);
  if (!projectExists) {
    return jsonNoStore({ ok: false, error: "Archive project not found", message: "اختر مشروعًا صحيحًا قبل حفظ الرابط." }, { status: 404 });
  }

  const actor = session?.user ? auditActorFromDashboardSession(session) : null;
  const result = await createArchiveDriveLinkInRepository(parsed.data, actor);

  return jsonNoStore(result, { status: result.ok ? 201 : 503 });
}

export async function PATCH(request: Request) {
  const { session, denied } = await requireArchiveApiAccess();
  if (denied) return denied;
  if (!process.env.DATABASE_URL) return jsonNoStore({ ok: false, error: "Database is not available" }, { status: 503 });

  const parsed = updateSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonNoStore({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });

  const snapshot = await getArchiveSnapshotDbBacked();
  const projectExists = snapshot.projects.some((project) => project.id === parsed.data.projectId);
  if (!projectExists) return jsonNoStore({ ok: false, error: "المشروع غير موجود" }, { status: 404 });

  const ids = extractDriveIds(parsed.data.driveUrl);
  const delegate = driveLinkDelegate();

  if (isRuntimeId(parsed.data.id) && delegate) {
    try {
      const row = await delegate.update({
        where: { id: parsed.data.id },
        data: {
          projectId: parsed.data.projectId,
          title: parsed.data.title,
          driveUrl: parsed.data.driveUrl,
          driveFolderId: ids.driveFolderId,
          driveFileId: ids.driveFileId,
          sharedDriveId: ids.sharedDriveId,
          linkType: ids.linkType,
        },
      });

      if (session?.user) {
        const actor = auditActorFromDashboardSession(session);
        await writeAuditLog({
          ...actor,
          action: "archive.drive-link.update",
          messageAr: "تم تعديل رابط ملف",
          messageEn: "Archive file link updated",
          entityType: "ArchiveDriveLink",
          entityId: row.id,
          metadata: { id: row.id, projectId: row.projectId, title: row.title, driveUrl: row.driveUrl, ...ids, source: "dashboard.archive.drive-links" },
          stream: "TEAM",
        });
      }

      return jsonNoStore({ ok: true, message: "تم حفظ التعديلات" });
    } catch (error) {
      console.error("ArchiveDriveLink update failed", error);
      return jsonNoStore({ ok: false, error: "تعذر حفظ التعديلات" }, { status: 500 });
    }
  }

  if (session?.user) {
    const actor = auditActorFromDashboardSession(session);
    await writeAuditLog({
      ...actor,
      action: "archive.drive-link.update",
      messageAr: "تم تعديل رابط ملف",
      messageEn: "Archive file link updated",
      entityType: "ArchiveDriveLink",
      entityId: parsed.data.id,
      metadata: { id: parsed.data.id, projectId: parsed.data.projectId, title: parsed.data.title, driveUrl: parsed.data.driveUrl, ...ids, source: "dashboard.archive.drive-links" },
      stream: "TEAM",
    });
  }

  return jsonNoStore({ ok: true, message: "تم حفظ التعديلات" });
}

export async function DELETE(request: Request) {
  const { session, denied } = await requireArchiveApiAccess();
  if (denied) return denied;
  if (!process.env.DATABASE_URL) return jsonNoStore({ ok: false, error: "Database is not available" }, { status: 503 });

  const parsed = deleteSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonNoStore({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });

  const snapshot = await getArchiveSnapshotDbBacked();
  const assetsCount = snapshot.assets.filter((asset) => asset.driveLinkId === parsed.data.id).length;
  if (assetsCount > 0) return jsonNoStore({ ok: false, error: "لا يمكن حذف رابط مرتبط بمواد" }, { status: 409 });

  const delegate = driveLinkDelegate();

  if (isRuntimeId(parsed.data.id) && delegate) {
    try {
      const row = await delegate.delete({ where: { id: parsed.data.id } });
      if (session?.user) {
        const actor = auditActorFromDashboardSession(session);
        await writeAuditLog({
          ...actor,
          action: "archive.drive-link.delete",
          messageAr: "تم حذف رابط ملف",
          messageEn: "Archive file link deleted",
          entityType: "ArchiveDriveLink",
          entityId: row.id,
          metadata: { id: row.id, projectId: row.projectId, title: row.title, driveUrl: row.driveUrl, source: "dashboard.archive.drive-links" },
          stream: "TEAM",
        });
      }
      return jsonNoStore({ ok: true, message: "تم حذف الرابط" });
    } catch (error) {
      console.error("ArchiveDriveLink delete failed", error);
      return jsonNoStore({ ok: false, error: "تعذر حذف الرابط" }, { status: 500 });
    }
  }

  if (session?.user) {
    const actor = auditActorFromDashboardSession(session);
    await writeAuditLog({
      ...actor,
      action: "archive.drive-link.delete",
      messageAr: "تم حذف رابط ملف",
      messageEn: "Archive file link deleted",
      entityType: "ArchiveDriveLink",
      entityId: parsed.data.id,
      metadata: { id: parsed.data.id, source: "dashboard.archive.drive-links" },
      stream: "TEAM",
    });
  }

  return jsonNoStore({ ok: true, message: "تم حذف الرابط" });
}
