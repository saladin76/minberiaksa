import { getArchiveSnapshotDbBacked } from "@/lib/archive/archive-service";
import { jsonNoStore, requireArchiveApiAccess } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { denied } = await requireArchiveApiAccess();
  if (denied) return denied;
  const url = new URL(request.url);
  const recommendedUse = url.searchParams.get("recommendedUse");
  const fileType = url.searchParams.get("fileType");
  const approvedOnly = url.searchParams.get("approvedOnly") === "true";
  const snapshot = await getArchiveSnapshotDbBacked();
  let assets = snapshot.assets;
  if (recommendedUse) assets = assets.filter((asset) => asset.recommendedUse === recommendedUse);
  if (fileType) assets = assets.filter((asset) => asset.fileType === fileType);
  if (approvedOnly) assets = assets.filter((asset) => asset.marketingApproved || asset.documentationApproved);
  return jsonNoStore({ ok: true, persistence: snapshot.persistence, assets });
}
