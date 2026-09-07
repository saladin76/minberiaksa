import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { getArchiveSnapshotDbBacked } from "@/lib/archive/archive-service";
import { persistContentItemProposalFromArchiveAsset } from "@/lib/operations/content-item-repository";
import { jsonNoStore, requireArchiveApiAccess } from "../../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const { session, denied } = await requireArchiveApiAccess();
  if (denied) return denied;
  const { id } = await Promise.resolve(context.params);
  const snapshot = await getArchiveSnapshotDbBacked();
  const asset = snapshot.assets.find((item) => item.id === id) ?? null;
  if (!asset) return jsonNoStore({ ok: false, error: "Asset not found" }, { status: 404 });
  const actor = session ? auditActorFromDashboardSession(session) : null;
  const result = await persistContentItemProposalFromArchiveAsset(asset, actor);
  return jsonNoStore({ ...result, persistence: snapshot.persistence }, { status: result.status });
}
