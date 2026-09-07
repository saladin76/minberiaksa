import { z } from "zod";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { createArchiveProjectInRepository } from "@/lib/archive/archive-mutation-service";
import { getArchiveSnapshotDbBacked } from "@/lib/archive/archive-service";
import { prisma } from "@/lib/prisma";
import { jsonNoStore, readJson, requireArchiveApiAccess } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const objectIdPattern = /^[a-f\d]{24}$/i;

type CountByProjectDelegate = { count(args: { where: { projectId: string } }): Promise<number> };

type ArchiveOptionalDelegates = {
  archiveDriveLink?: CountByProjectDelegate;
  archiveAsset?: CountByProjectDelegate;
};

const schema = z.object({
  collectionId: z.string().trim().optional(),
  title: z.string().trim().min(1).max(220),
  year: z.number().int().min(2000).max(2100).optional(),
  country: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  theme: z.string().trim().max(100).optional(),
  projectType: z.string().trim().max(120).optional(),
  description: z.string().trim().max(800).optional(),
  notes: z.string().trim().max(800).optional(),
});

const updateSchema = schema.extend({
  id: z.string().trim().min(1),
});

const deleteSchema = z.object({
  id: z.string().trim().min(1),
});

function isRuntimeId(id: string) {
  return objectIdPattern.test(id);
}

function safeObjectId(id?: string | null) {
  return id && objectIdPattern.test(id) ? id : null;
}

export async function GET() {
  const { denied } = await requireArchiveApiAccess();
  if (denied) return denied;
  const snapshot = await getArchiveSnapshotDbBacked();
  return jsonNoStore({ ok: true, persistence: snapshot.persistence, projects: snapshot.projects });
}

export async function POST(request: Request) {
  const { session, denied } = await requireArchiveApiAccess();
  if (denied) return denied;

  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return jsonNoStore({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });

  const result = await createArchiveProjectInRepository(parsed.data, session?.user?.id);

  if (result.ok && result.data && session?.user) {
    const actor = auditActorFromDashboardSession(session);
    await writeAuditLog({
      ...actor,
      action: "archive.project.create",
      messageAr: "تم إنشاء مشروع أرشيف",
      messageEn: "Archive project created",
      entityType: "ArchiveProject",
      entityId: result.data.id,
      metadata: {
        title: result.data.title,
        collectionId: result.data.collectionId,
        year: result.data.year,
        source: "dashboard.archive.projects",
      },
      stream: "TEAM",
    });
  }

  return jsonNoStore(result, { status: result.ok ? 201 : 503 });
}

export async function PATCH(request: Request) {
  const { session, denied } = await requireArchiveApiAccess();
  if (denied) return denied;
  if (!process.env.DATABASE_URL) return jsonNoStore({ ok: false, error: "Database is not available" }, { status: 503 });

  const parsed = updateSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonNoStore({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });

  if (!isRuntimeId(parsed.data.id)) {
    if (session?.user) {
      const actor = auditActorFromDashboardSession(session);
      await writeAuditLog({
        ...actor,
        action: "archive.project.update",
        messageAr: "تم تعديل مشروع أرشيف",
        messageEn: "Archive project updated",
        entityType: "ArchiveProject",
        entityId: parsed.data.id,
        metadata: {
          id: parsed.data.id,
          collectionId: parsed.data.collectionId,
          title: parsed.data.title,
          year: parsed.data.year || new Date().getFullYear(),
          country: parsed.data.country || "",
          city: parsed.data.city || "",
          theme: parsed.data.theme || "",
          projectType: parsed.data.projectType || "",
          description: parsed.data.description || "",
          notes: parsed.data.notes || "",
          source: "dashboard.archive.projects",
        },
        stream: "TEAM",
      });
    }
    return jsonNoStore({ ok: true, message: "تم حفظ التعديلات" });
  }

  try {
    const row = await prisma.archiveProject.update({
      where: { id: parsed.data.id },
      data: {
        collectionId: safeObjectId(parsed.data.collectionId),
        title: parsed.data.title,
        year: parsed.data.year || new Date().getFullYear(),
        country: parsed.data.country || "",
        city: parsed.data.city || "",
        theme: parsed.data.theme || "",
        projectType: parsed.data.projectType || "",
        description: parsed.data.description || "",
        notes: parsed.data.notes || "",
      },
    });

    if (session?.user) {
      const actor = auditActorFromDashboardSession(session);
      await writeAuditLog({
        ...actor,
        action: "archive.project.update",
        messageAr: "تم تعديل مشروع أرشيف",
        messageEn: "Archive project updated",
        entityType: "ArchiveProject",
        entityId: row.id,
        metadata: { id: row.id, title: row.title, collectionId: row.collectionId, year: row.year, country: row.country, city: row.city, theme: row.theme, projectType: row.projectType, description: row.description, notes: row.notes, source: "dashboard.archive.projects" },
        stream: "TEAM",
      });
    }

    return jsonNoStore({ ok: true, message: "تم حفظ التعديلات" });
  } catch (error) {
    console.error("ArchiveProject update failed", error);
    return jsonNoStore({ ok: false, error: "تعذر حفظ التعديلات" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { session, denied } = await requireArchiveApiAccess();
  if (denied) return denied;
  if (!process.env.DATABASE_URL) return jsonNoStore({ ok: false, error: "Database is not available" }, { status: 503 });

  const parsed = deleteSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonNoStore({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });

  if (!isRuntimeId(parsed.data.id)) {
    const snapshot = await getArchiveSnapshotDbBacked();
    const driveLinksCount = snapshot.driveLinks.filter((link) => link.projectId === parsed.data.id).length;
    const assetsCount = snapshot.assets.filter((asset) => asset.projectId === parsed.data.id).length;
    if (driveLinksCount > 0 || assetsCount > 0) {
      return jsonNoStore({ ok: false, error: "لا يمكن حذف مشروع يحتوي على روابط أو مواد" }, { status: 409 });
    }

    if (session?.user) {
      const actor = auditActorFromDashboardSession(session);
      await writeAuditLog({
        ...actor,
        action: "archive.project.delete",
        messageAr: "تم حذف مشروع أرشيف",
        messageEn: "Archive project deleted",
        entityType: "ArchiveProject",
        entityId: parsed.data.id,
        metadata: { id: parsed.data.id, source: "dashboard.archive.projects" },
        stream: "TEAM",
      });
    }
    return jsonNoStore({ ok: true, message: "تم حذف المشروع" });
  }

  try {
    const delegates = prisma as unknown as ArchiveOptionalDelegates;
    const driveLinksCount = delegates.archiveDriveLink ? await delegates.archiveDriveLink.count({ where: { projectId: parsed.data.id } }) : 0;
    const assetsCount = delegates.archiveAsset ? await delegates.archiveAsset.count({ where: { projectId: parsed.data.id } }) : 0;

    if (driveLinksCount > 0 || assetsCount > 0) {
      return jsonNoStore({ ok: false, error: "لا يمكن حذف مشروع يحتوي على روابط أو مواد" }, { status: 409 });
    }

    const row = await prisma.archiveProject.delete({ where: { id: parsed.data.id } });

    if (session?.user) {
      const actor = auditActorFromDashboardSession(session);
      await writeAuditLog({
        ...actor,
        action: "archive.project.delete",
        messageAr: "تم حذف مشروع أرشيف",
        messageEn: "Archive project deleted",
        entityType: "ArchiveProject",
        entityId: row.id,
        metadata: { id: row.id, title: row.title, collectionId: row.collectionId, year: row.year, source: "dashboard.archive.projects" },
        stream: "TEAM",
      });
    }

    return jsonNoStore({ ok: true, message: "تم حذف المشروع" });
  } catch (error) {
    console.error("ArchiveProject delete failed", error);
    return jsonNoStore({ ok: false, error: "تعذر حذف المشروع" }, { status: 500 });
  }
}
