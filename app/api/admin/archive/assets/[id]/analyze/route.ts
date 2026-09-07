import { analyzeArchiveAsset } from "@/lib/archive/archive-service";
import { dashboardUser, jsonNoStore, requireArchiveApiAccess } from "../../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const { session, denied } = await requireArchiveApiAccess();
  if (denied) return denied;
  const { id } = await Promise.resolve(context.params);
  return jsonNoStore(analyzeArchiveAsset(id, dashboardUser(session)));
}
