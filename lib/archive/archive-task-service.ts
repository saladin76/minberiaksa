import { createOperationTaskInRepository } from "@/lib/operations/tasks/task-repository";
import type { OperationTaskMutationResult } from "@/lib/operations/tasks/task-repository";
import { getArchiveSnapshotDbBacked } from "./archive-service";
import type { ArchiveAsset } from "./archive-types";

const objectIdPattern = /^[a-f\d]{24}$/i;

export type ArchiveAssetTaskAssignmentResult = {
  ok: boolean;
  mode: OperationTaskMutationResult["mode"] | "foundation";
  message: string;
  externalCall: false;
  data?: {
    task?: OperationTaskMutationResult["task"];
    asset?: Pick<ArchiveAsset, "id" | "fileName" | "fileType" | "recommendedUse" | "humanReviewStatus" | "isSensitive" | "needsBlur">;
    projectTitle?: string;
  };
};

function taskTypeForAsset(asset: ArchiveAsset) {
  if (asset.fileType === "VIDEO") return "VIDEO" as const;
  if (asset.fileType === "IMAGE") return "DESIGN" as const;
  if (asset.recommendedUse === "CAROUSEL") return "CAROUSEL" as const;
  if (asset.recommendedUse === "WHATSAPP") return "MESSAGING" as const;
  return "WRITING" as const;
}

function priorityForAsset(asset: ArchiveAsset) {
  if (asset.isSensitive || asset.needsBlur || asset.humanReviewStatus === "PENDING") return "HIGH" as const;
  return asset.marketingApproved ? "MEDIUM" as const : "LOW" as const;
}

function safeSourceId(id: string) {
  return objectIdPattern.test(id) ? id : undefined;
}

export async function assignArchiveAssetToOperationTask(
  assetId: string,
  actorId?: string | null,
): Promise<ArchiveAssetTaskAssignmentResult> {
  const snapshot = await getArchiveSnapshotDbBacked();
  const asset = snapshot.assets.find((item) => item.id === assetId);

  if (!asset) {
    return {
      ok: false,
      mode: "foundation",
      externalCall: false,
      message: "Archive asset not found.",
    };
  }

  const project = snapshot.projects.find((item) => item.id === asset.projectId);
  const result = await createOperationTaskInRepository(
    {
      title: `Review archive asset: ${asset.fileName}`,
      description: [
        `Archive asset review task created from ${asset.fileName}.`,
        project ? `Project: ${project.title}.` : "Project: to be verified.",
        `Recommended use: ${asset.recommendedUse}.`,
        asset.isSensitive || asset.needsBlur ? "Sensitive/blur review is required before marketing use." : "Human review is still required before marketing use.",
      ].join(" "),
      taskType: taskTypeForAsset(asset),
      status: "PENDING",
      priority: priorityForAsset(asset),
      sourceType: "ARCHIVE_ASSET",
      sourceId: safeSourceId(asset.id),
      resultNotes: `ArchiveAsset=${asset.id}; driveLink=${asset.driveLinkId ?? "none"}; humanReview=${asset.humanReviewStatus}; marketingApproved=${asset.marketingApproved}`,
    },
    actorId,
  );

  return {
    ok: result.ok,
    mode: result.mode,
    externalCall: false,
    message: result.ok ? "OperationTask created from ArchiveAsset." : result.message,
    data: {
      task: result.task,
      projectTitle: project?.title,
      asset: {
        id: asset.id,
        fileName: asset.fileName,
        fileType: asset.fileType,
        recommendedUse: asset.recommendedUse,
        humanReviewStatus: asset.humanReviewStatus,
        isSensitive: asset.isSensitive,
        needsBlur: asset.needsBlur,
      },
    },
  };
}
