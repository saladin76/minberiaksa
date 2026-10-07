import "server-only";

import { prisma } from "@/lib/prisma";

export type CampaignMetadata = Record<string, unknown>;

type MutationOptions = {
  /** Optional status to write atomically with the metadata mutation. */
  status?: string;
  /** Optional status precondition; useful when a lease may only be claimed while SENDING. */
  expectedStatus?: string;
  attempts?: number;
};

/**
 * Compare-and-swap metadata mutation.
 *
 * CommunicationCampaign.metadata is one JSON document shared by campaign controls,
 * resumable-send progress and other campaign features. Rewriting it from an old
 * campaign snapshot can silently erase a newer pause/quiet-hours update. This helper
 * always reads the latest document and only writes while updatedAt still matches.
 * If another writer wins first, it retries against that newer state.
 */
export async function mutateCampaignMetadata(
  campaignId: string,
  mutate: (current: CampaignMetadata) => CampaignMetadata | null,
  options: MutationOptions = {},
): Promise<boolean> {
  const attempts = Math.max(1, Math.min(options.attempts ?? 5, 10));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const latest = await prisma.communicationCampaign.findUnique({
      where: { id: campaignId },
      select: { metadata: true, updatedAt: true },
    }).catch(() => null);
    if (!latest) return false;

    const current = (latest.metadata as CampaignMetadata | null) ?? {};
    const next = mutate(current);
    if (next === null) return false;
    const data: { metadata: never; status?: string } = { metadata: next as never };
    if (options.status) data.status = options.status;

    const result = await prisma.communicationCampaign.updateMany({
      where: {
        id: campaignId,
        updatedAt: latest.updatedAt,
        ...(options.expectedStatus ? { status: options.expectedStatus } : {}),
      },
      data,
    }).catch(() => ({ count: 0 }));

    if (result.count === 1) return true;
  }

  return false;
}

export async function mergeCampaignMetadata(
  campaignId: string,
  patch: CampaignMetadata,
  options: MutationOptions = {},
): Promise<boolean> {
  return mutateCampaignMetadata(
    campaignId,
    (current) => ({ ...current, ...patch }),
    options,
  );
}
