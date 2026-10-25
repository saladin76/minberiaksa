/** Shared by the recorder and dashboard links; verified from the live project. */
export const DEFAULT_CLARITY_PROJECT_ID = "u60r8zhrzh";

export function clarityProjectId(configured = process.env.NEXT_PUBLIC_CLARITY_ID): string {
  return configured?.trim() || DEFAULT_CLARITY_PROJECT_ID;
}

export function clarityUserRecordingsUrl(userId: string, configured = process.env.NEXT_PUBLIC_CLARITY_ID): string {
  return `https://clarity.microsoft.com/projects/view/${encodeURIComponent(clarityProjectId(configured))}/impressions?CustomFilter=User-id%3DIs%3D${encodeURIComponent(userId)}`;
}
