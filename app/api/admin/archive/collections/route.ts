import { z } from "zod";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { createArchiveCollectionInRepository } from "@/lib/archive/archive-mutation-service";
import { getArchiveSnapshotDbBacked } from "@/lib/archive/archive-service";
import { prisma } from "@/lib/prisma";
import { jsonNoStore, readJson, requireArchiveApiAccess } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const objectIdPattern = /^[a-f\d]{24}$/i;

const schema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().max(120).optional(),
  type: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
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

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || `archive-${Date.now()}`;
}

export async function GET() {
  const { denied } = await requireArchiveApiAccess();
  if (denied) return denied;
  const snapshot = await getArchiveSnapshotDbBacked();
  return jsonNoStore({ ok: true, persistence: snapshot.persistence, collections: snapshot.collections });
}

export async function POST(request: Request) {
  const { session, denied } = await requireArchiveApiAccess();
  if (denied) return denied;

  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return jsonNoStore({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });

  const result = await createArchiveCollectionInRepository(parsed.data, session?.user?.id);

  if (result.ok && result.data && session?.user) {
    const actor = auditActorFromDashboardSession(session);
    await writeAuditLog({
      ...actor,
      action: "archive.collection.create",
      messageAr: "تم إنشاء مجموعة أرشيف",
      messageEn: "Archive collection created",
      entityType: "ArchiveCollection",
      entityId: result.data.id,
      metadata: {
        name: result.data.name,
        slug: result.data.slug,
        type: result.data.type,
        source: "dashboard.archive.collections",
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
        action: "archive.collection.update",
        messageAr: "تم تعديل مجموعة أرشيف",
        messageEn: "Archive collection updated",
        entityType: "ArchiveCollection",
        entityId: parsed.data.id,
        metadata: {
          id: parsed.data.id,
          name: parsed.data.name,
          slug: parsed.data.slug ? slugify(parsed.data.slug) : slugify(parsed.data.name),
          type: parsed.data.type || "GENERAL",
          description: parsed.data.description || "",
          source: "dashboard.archive.collections",
        },
        stream: "TEAM",
      });
    }
    return jsonNoStore({ ok: true, message: "تم حفظ التعديلات" });
  }

  try {
    const row = await prisma.archiveCollection.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug ? slugify(parsed.data.slug) : undefined,
        type: parsed.data.type || "GENERAL",
        description: parsed.data.description || "",
      },
    });

    if (session?.user) {
      const actor = auditActorFromDashboardSession(session);
      await writeAuditLog({
        ...actor,
        action: "archive.collection.update",
        messageAr: "تم تعديل مجموعة أرشيف",
        messageEn: "Archive collection updated",
        entityType: "ArchiveCollection",
        entityId: row.id,
        metadata: { id: row.id, name: row.name, slug: row.slug, type: row.type, description: row.description, source: "dashboard.archive.collections" },
        stream: "TEAM",
      });
    }

    return jsonNoStore({ ok: true, message: "تم حفظ التعديلات" });
  } catch (error) {
    console.error("ArchiveCollection update failed", error);
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
    const projectsCount = snapshot.projects.filter((project) => project.collectionId === parsed.data.id).length;
    if (projectsCount > 0) return jsonNoStore({ ok: false, error: "لا يمكن حذف مجموعة تحتوي على مشاريع" }, { status: 409 });

    if (session?.user) {
      const actor = auditActorFromDashboardSession(session);
      await writeAuditLog({
        ...actor,
        action: "archive.collection.delete",
        messageAr: "تم حذف مجموعة أرشيف",
        messageEn: "Archive collection deleted",
        entityType: "ArchiveCollection",
        entityId: parsed.data.id,
        metadata: { id: parsed.data.id, source: "dashboard.archive.collections" },
        stream: "TEAM",
      });
    }
    return jsonNoStore({ ok: true, message: "تم حذف المجموعة" });
  }

  try {
    const projectsCount = await prisma.archiveProject.count({ where: { collectionId: parsed.data.id } });
    if (projectsCount > 0) return jsonNoStore({ ok: false, error: "لا يمكن حذف مجموعة تحتوي على مشاريع" }, { status: 409 });

    const row = await prisma.archiveCollection.delete({ where: { id: parsed.data.id } });

    if (session?.user) {
      const actor = auditActorFromDashboardSession(session);
      await writeAuditLog({
        ...actor,
        action: "archive.collection.delete",
        messageAr: "تم حذف مجموعة أرشيف",
        messageEn: "Archive collection deleted",
        entityType: "ArchiveCollection",
        entityId: row.id,
        metadata: { id: row.id, name: row.name, slug: row.slug, source: "dashboard.archive.collections" },
        stream: "TEAM",
      });
    }

    return jsonNoStore({ ok: true, message: "تم حذف المجموعة" });
  } catch (error) {
    console.error("ArchiveCollection delete failed", error);
    return jsonNoStore({ ok: false, error: "تعذر حذف المجموعة" }, { status: 500 });
  }
}
