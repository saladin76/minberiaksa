import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { AccessRule } from "./policy";
export const RULES_COLLECTION = "SiteAccessRule",
  VISITORS_COLLECTION = "SiteVisitor";
const date = (value: unknown): string => {
  const raw =
    value && typeof value === "object" && "$date" in value
      ? (value as { $date: unknown }).$date
      : value;
  const parsed =
    typeof raw === "string"
      ? new Date(raw)
      : raw && typeof raw === "object" && "$numberLong" in raw
        ? new Date(Number((raw as { $numberLong: string }).$numberLong))
        : null;
  return parsed && Number.isFinite(parsed.getTime())
    ? parsed.toISOString()
    : "";
};
// Group into a single result document so MongoDB's default 101-row cursor batch
// cannot silently truncate a larger access policy.
export async function readAccessRules(
  includeDisabled = false,
): Promise<AccessRule[]> {
  const result = await prisma.$runCommandRaw({
    aggregate: RULES_COLLECTION,
    pipeline: [
      ...(includeDisabled ? [] : [{ $match: { enabled: true } }]),
      { $sort: { updatedAt: -1 } },
      { $group: { _id: null, rules: { $push: "$$ROOT" } } },
    ],
    cursor: { batchSize: 1 },
    maxTimeMS: 1000,
  });
  if (result.ok !== 1) throw new Error("ACCESS_POLICY_READ_FAILED");
  const rules = rawRows(result)[0]?.rules;
  return Array.isArray(rules)
    ? rules.map((rule) => publicRule(rule as Record<string, unknown>))
    : [];
}
export function rawRows(result: unknown): Record<string, unknown>[] {
  return (
    (result as { cursor?: { firstBatch?: Record<string, unknown>[] } })?.cursor
      ?.firstBatch || []
  );
}
export function publicRule(row: Record<string, unknown>): AccessRule {
  return {
    id: String(row._id),
    kind: row.kind as AccessRule["kind"],
    value: String(row.value),
    action: row.action as AccessRule["action"],
    reason: String(row.reason || ""),
    enabled: row.enabled === true,
    expiresAt: date(row.expiresAt) || null,
    updatedAt: date(row.updatedAt),
  };
}
let cached: { expires: number; rules: AccessRule[] } | null = null,
  pending: Promise<AccessRule[]> | null = null;
let generation = 0;
export function clearAccessRulesCache() {
  cached = null;
  pending = null;
  generation++;
}
export async function accessRules() {
  if (cached && cached.expires > Date.now()) return cached.rules;
  const startedGeneration = generation;
  const load = async () => {
    const rules = await readAccessRules();
    if (startedGeneration === generation)
      cached = { expires: Date.now() + 5000, rules };
    return rules;
  };
  const work = pending || load();
  pending = work;
  void work
    .finally(() => {
      if (pending === work) pending = null;
    })
    .catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<AccessRule[]>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("ACCESS_POLICY_TIMEOUT")),
          1000,
        );
      }),
    ]);
  } catch (error) {
    if (cached) return cached.rules;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
const recorded = new Map<string, number>();
export async function recordSiteVisitor(input: {
  ip: string;
  country: string | null;
  userId: string | null;
  path: string;
  blocked: boolean;
}) {
  const id = createHash("sha256")
    .update((input.userId || "guest") + ":" + input.ip)
    .digest("hex");
  if ((recorded.get(id) || 0) > Date.now() - 60_000) return;
  if (recorded.size > 5000) recorded.clear();
  recorded.set(id, Date.now());
  try {
    const now = new Date();
    const result = await prisma.$runCommandRaw({
      update: VISITORS_COLLECTION,
      updates: [
        {
          q: { _id: id },
          u: {
            $setOnInsert: { firstSeenAt: { $date: now.toISOString() } },
            $set: {
              ip: input.ip,
              userId: input.userId,
              country: input.country,
              path: input.path.slice(0, 300),
              blocked: input.blocked,
              lastSeenAt: { $date: now.toISOString() },
              expiresAt: {
                $date: new Date(now.getTime() + 90 * 86400_000).toISOString(),
              },
            },
            $inc: { visits: 1 },
          },
          upsert: true,
        },
      ],
      maxTimeMS: 1500,
    } as Prisma.InputJsonObject);
    if (result.ok !== 1 || result.writeErrors)
      throw new Error("VISITOR_WRITE_FAILED");
  } catch {
    recorded.delete(id);
  }
}
export const visitorDate = date;
