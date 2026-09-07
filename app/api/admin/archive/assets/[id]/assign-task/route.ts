import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { assignArchiveAssetToOperationTask } from "@/lib/archive/archive-task-service";
import { jsonNoStore, requireArchiveApiAccess } from "../../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const { session, denied } = await requireArchiveApiAccess();
  if (denied) return denied;

  const { id } = await Promise.resolve(context.params);
  const actor = session?.user ? auditActorFromDashboardSession(session) : null;
  const result = await assignArchiveAssetToOperationTask(id, session?.user?.id);

  if (result.ok && result.data?.task && actor) {
    await writeAuditLog({
      ...actor,
      action: "archive.asset.assign_task",
      messageAr: "تم إنشاء مهمة من أصل أرشيفي",
      messageEn: "Archive asset assigned to an operation task",
      entityType: "OperationTask",
      entityId: result.data.task.id,
      metadata: {
        archiveAssetId: result.data.asset?.id,
        fileName: result.data.asset?.fileName,
        recommendedUse: result.data.asset?.recommendedUse,
        projectTitle: result.data.projectTitle,
        source: "dashboard.archive.assets.assign-task",
      },
      stream: "TEAM",
    });
  }

  return jsonNoStore(result, { status: result.ok ? 201 : 503 });
}
