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

  const hasDriveId = Boolean(link.driveFolderId || link.driveFileId);

  return jsonNoStore(
    {
      ok: hasDriveId,
      mode: snapshot.persistence.mode,
      externalCall: false,
      message: hasDriveId
        ? "Drive id parsed. Real access test requires configured Google Drive provider."
        : "No Drive folder/file id parsed yet.",
      data: {
        link,
        providerSource: "MarketingPlatformConnection / provider catalog",
        scopes: ["drive.file preferred", "drive.readonly only when justified"],
        readyForProviderTest: hasDriveId,
      },
    },
    { status: hasDriveId ? 200 : 400 },
  );
}
