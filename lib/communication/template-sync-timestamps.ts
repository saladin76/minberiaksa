/** Keep the last successful sync distinct from the oldest saved variant. */
export function templateSyncTimestamps(values: ReadonlyArray<Date | string | null | undefined>) {
  const timestamps = values.flatMap((value) => {
    if (value == null) return [];
    const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(timestamp) ? [timestamp] : [];
  });
  return {
    latestAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
    oldestAt: timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null,
    complete: values.length > 0 && timestamps.length === values.length,
  };
}

type SyncDates = { lastSyncedAt: Date | string | null; latestSyncedAt?: Date | string | null; oldestSyncedAt?: Date | string | null };
/** Compute over every template before a dashboard truncates its preview rows. */
export function templateSyncCoverage(rows: ReadonlyArray<SyncDates>) {
  return {
    latestAt: templateSyncTimestamps(rows.map(row => row.latestSyncedAt ?? row.lastSyncedAt)).latestAt,
    oldestAt: templateSyncTimestamps(rows.map(row => row.oldestSyncedAt ?? row.lastSyncedAt)).oldestAt,
    complete: templateSyncTimestamps(rows.map(row => row.lastSyncedAt)).complete,
  };
}
