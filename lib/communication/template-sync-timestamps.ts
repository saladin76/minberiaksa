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
