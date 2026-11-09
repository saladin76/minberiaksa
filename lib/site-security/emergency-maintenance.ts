import "server-only";
import { prisma } from "@/lib/prisma";
export const MAINTENANCE_COLLECTION = "SiteEmergencyMaintenance";
const KEY = "site";
export type MaintenanceSnapshot = { enabled: boolean; revision: number; reason: string; updatedAt: string | null };
function unpack(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string,unknown>;
    return Number(obj.$numberInt ?? obj.$numberLong ?? NaN);
  }
  return NaN;
}
function parseDate(raw: unknown): string | null {
  const date = raw && typeof raw === "object" && "$date" in raw
    ? (raw as { $date: unknown }).$date : raw;
  const value = typeof date === "string" ? new Date(date) : null;
  return value && Number.isFinite(value.getTime()) ? value.toISOString() : null;
}
export function parseMaintenanceSnapshot(raw: unknown): MaintenanceSnapshot {
  if (!raw || typeof raw !== "object") throw new Error("INVALID_MAINTENANCE_RECORD");
  const doc = raw as Record<string, unknown>;
  const revision = unpack(doc.revision);
  if (!Number.isSafeInteger(revision) || revision < 0 || typeof doc.enabled !== "boolean")
    throw new Error("INVALID_MAINTENANCE_RECORD");
  return {
    enabled: doc.enabled, revision,
    reason: typeof doc.reason === "string" ? doc.reason.slice(0, 300) : "",
    updatedAt: parseDate(doc.updatedAt),
  };
}
let cached: { until: number; value: MaintenanceSnapshot } | null = null;
export function clearMaintenanceCache() { cached = null; }
export async function readEmergencyMaintenance(fresh = false): Promise<MaintenanceSnapshot> {
  // Independent infrastructure-level override for a database outage or
  // compromised application state. Turning this OFF requires the operator
  // to remove the server environment flag, not merely clicking the UI.
  if (process.env.EMERGENCY_MAINTENANCE_FORCE === "true") {
    return { enabled: true, revision: -1, reason: "INFRASTRUCTURE_EMERGENCY_LOCK", updatedAt: null };
  }
  if (!fresh && cached && cached.until > Date.now()) return cached.value;
  const result = await prisma.$runCommandRaw({
    find: MAINTENANCE_COLLECTION,
    filter: { _id: KEY },
    limit: 1,
    maxTimeMS: 1200,
  });
  if (result.ok !== 1) throw new Error("MAINTENANCE_READ_FAILED");
  const first = (result as { cursor?: { firstBatch?: unknown[] } }).cursor?.firstBatch;
  if (!Array.isArray(first)) throw new Error("MAINTENANCE_READ_INCOMPLETE");
  const value = first.length
    ? parseMaintenanceSnapshot(first[0])
    : { enabled: false, revision: 0, reason: "", updatedAt: null };
  cached = { until: Date.now() + 1000, value };
  return value;
}
/** Compare-and-swap prevents two administrators overwriting each other's emergency action. */
export async function setEmergencyMaintenance(input: {
  enabled: boolean; expectedRevision: number; reason: string; actorId: string;
}): Promise<MaintenanceSnapshot> {
  const prior = await readEmergencyMaintenance(true);
  if (prior.revision !== input.expectedRevision) throw new Error("MAINTENANCE_STALE_REVISION");
  const now = new Date().toISOString();
  const result = await prisma.$runCommandRaw({
    findAndModify: MAINTENANCE_COLLECTION,
    query: prior.revision === 0
      ? { _id: KEY, revision: { $exists: false } }
      : { _id: KEY, revision: prior.revision },
    update: {
      $set: {
        enabled: input.enabled,
        reason: input.reason,
        updatedAt: { $date: now },
        updatedBy: input.actorId,
      },
      $inc: { revision: 1 },
    },
    upsert: prior.revision === 0,
    new: true,
    maxTimeMS: 2000,
  }) as { ok?: number; value?: unknown; lastErrorObject?: { updatedExisting?: boolean } };
  if (result.ok !== 1 || !result.value) throw new Error("MAINTENANCE_STALE_REVISION");
  const saved = parseMaintenanceSnapshot(result.value);
  if (saved.revision !== prior.revision + 1) throw new Error("MAINTENANCE_WRITE_UNCERTAIN");
  clearMaintenanceCache();
  return saved;
}
