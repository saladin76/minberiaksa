/** Shared by the recorder and dashboard links; verified from the live project. */
export const DEFAULT_CLARITY_PROJECT_ID = "u60r8zhrzh";

export function clarityProjectId(configured = process.env.NEXT_PUBLIC_CLARITY_ID): string {
  return configured?.trim() || DEFAULT_CLARITY_PROJECT_ID;
}

export function clarityUserRecordingsUrl(userId: string, configured = process.env.NEXT_PUBLIC_CLARITY_ID): string {
  return `https://clarity.microsoft.com/projects/view/${encodeURIComponent(clarityProjectId(configured))}/impressions?CustomFilter=User-id%3DIs%3D${encodeURIComponent(userId)}`;
}

/** Operator-supplied IDs are data, never code or remote script URLs. */
export function normalizeClarityProjectId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return /^[a-z0-9]{6,32}$/.test(id) ? id : null;
}

export type ClarityConnection = {
  clarityProjectId: string | null;
  clarityEnabled: boolean;
  claritySource: "saved" | "legacy" | "disabled";
};

/**
 * Existing deployments already load the legacy ID automatically. The absence
 * of an operator override preserves that behavior; explicit false always wins.
 */
export function resolveClarityConnection(
  stored: Record<string, unknown> | null,
  legacy = process.env.NEXT_PUBLIC_CLARITY_ID,
): ClarityConnection {
  const saved = normalizeClarityProjectId(stored?.clarityProjectId);
  const fallback = normalizeClarityProjectId(legacy) || DEFAULT_CLARITY_PROJECT_ID;
  const id = saved || fallback;
  const enabled = stored?.clarityEnabled !== false;
  return { clarityProjectId: id, clarityEnabled: enabled, claritySource: !enabled ? "disabled" : saved ? "saved" : "legacy" };
}

export function clarityProjectDashboardUrl(value: unknown): string | null {
  const id = normalizeClarityProjectId(value);
  return id ? `https://clarity.microsoft.com/projects/view/${encodeURIComponent(id)}/impressions` : null;
}
