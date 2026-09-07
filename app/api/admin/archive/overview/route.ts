import { getArchiveSnapshot } from "@/lib/archive/archive-service";
import { jsonNoStore, requireArchiveApiAccess } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { denied } = await requireArchiveApiAccess();
  if (denied) return denied;
  return jsonNoStore({ ok: true, archive: getArchiveSnapshot() });
}
