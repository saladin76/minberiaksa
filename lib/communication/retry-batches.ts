export const RETRY_BATCH_CAP = 25;

/** Split one confirmed retry plan into provider-safe requests without dropping or repeating ids. */
export function partitionRetryIds(ids: readonly string[], requestedSize = RETRY_BATCH_CAP): string[][] {
  const size = Number.isFinite(requestedSize)
    ? Math.max(1, Math.min(RETRY_BATCH_CAP, Math.floor(requestedSize)))
    : RETRY_BATCH_CAP;
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
  const batches: string[][] = [];
  for (let offset = 0; offset < unique.length; offset += size) {
    batches.push(unique.slice(offset, offset + size));
  }
  return batches;
}
