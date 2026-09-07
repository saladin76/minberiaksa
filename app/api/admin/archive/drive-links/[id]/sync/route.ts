import { getArchiveSnapshotDbBacked } from "@/lib/archive/archive-service";
import { jsonNoStore, requireArchiveApiAccess } from "../../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const { denied } = await requireArchiveApiAccess();
  if (denied) return denied;

  const { id } = await Promise.resolve(context.params);
  const snapshot = await getArchiveSnapshotDbBacked();
  const link = snapshot.driveLinks.find((item) => item.id === id) ?? null;

  if (!link) {
    return jsonNoStore(
      { ok: false, mode: snapshot.persistence.mode, externalCall: false, message: "Drive link not found." },
      { status: 404 },
    );
  }

  const projectExists = snapshot.projects.some((project) => project.id === link.projectId);
  if (!projectExists) {
    return jsonNoStore(
      { ok: false, mode: snapshot.persistence.mode, externalCall: false, message: "Drive link project was not found." },
      { status: 409 },
    );
  }

  return jsonNoStore({
    ok: true,
    mode: snapshot.persistence.mode,
    externalCall: false,
    message: "Sync skipped safely. Metadata sync contract is ready for provider-backed implementation.",
    data: {
      ...link,
      syncStatus: "SYNC_SKIPPED",
      lastSyncedAt: new Date().toISOString(),
      lastError: "Foundation mode: no Google Drive external call was made.",
    },
    safety: {
      downloadedFiles: false,
      analyzedFiles: false,
      externalDriveCall: false,
    },
  });
}
