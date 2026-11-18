import type { CommunicationDelivery, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Index-friendly execution for the communication dashboards (2026-11-18).
 *
 * On MongoDB, Prisma wraps every filter of count/groupBy/findMany in `$expr`, which the database
 * cannot answer from an index: each dashboard load scanned the whole CommunicationDelivery table
 * (~200k documents, many carrying a full e-mail body) — 8–17 s per query, ~28 s per page. These
 * drop-in replacements take the SAME arguments the dashboards already build and return the SAME
 * shapes, but run as plain MongoDB queries that use the channel/purpose/createdAt indexes.
 * Any filter operator not translated below throws instead of silently returning wrong numbers.
 * Results were verified identical to Prisma's on production data before this was merged.
 */
type Where = Record<string, unknown>;
type Doc = Record<string, unknown>;

const OBJECT_ID_FIELDS = new Set(["id", "campaignId", "recipientUserId", "senderId", "templateId", "retryOfDeliveryId", "deliveryId", "createdBy"]);
const isHex24 = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{24}$/i.test(v);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function rawValue(field: string, value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (OBJECT_ID_FIELDS.has(field) && isHex24(value)) return { $oid: value };
  return value;
}

/** A Prisma `where` (the subset the dashboards use) as a plain MongoDB filter. */
export function toMongoFilter(where: Where | undefined | null): Doc {
  const parts: Doc[] = [];
  for (const [key, value] of Object.entries(where ?? {})) {
    if (value === undefined) continue;
    if (key === "AND" || key === "NOT") {
      const list = (Array.isArray(value) ? value : [value]).map((w) => toMongoFilter(w as Where));
      if (list.length) parts.push(key === "AND" ? { $and: list } : { $nor: list });
      continue;
    }
    if (key === "OR") {
      const list = (value as Where[]).map((w) => toMongoFilter(w));
      parts.push(list.length ? { $or: list } : { _id: { $exists: false } });
      continue;
    }
    const field = key === "id" ? "_id" : key;
    if (value === null || typeof value !== "object" || value instanceof Date) {
      parts.push({ [field]: rawValue(key, value) });
      continue;
    }
    const cond: Doc = {};
    for (const [op, arg] of Object.entries(value as Doc)) {
      if (arg === undefined) continue;
      if (op === "equals") cond.$eq = rawValue(key, arg);
      else if (op === "in") cond.$in = (arg as unknown[]).map((v) => rawValue(key, v));
      else if (op === "notIn") cond.$nin = (arg as unknown[]).map((v) => rawValue(key, v));
      else if (op === "not") {
        if (arg !== null && typeof arg === "object" && !(arg instanceof Date)) throw new Error(`UNSUPPORTED_FILTER not:{…} on ${key}`);
        cond.$ne = rawValue(key, arg);
      } else if (op === "gt" || op === "gte" || op === "lt" || op === "lte") cond[`$${op}`] = rawValue(key, arg);
      else if (op === "contains") cond.$regex = escapeRegex(String(arg));
      else if (op === "mode") { if (arg === "insensitive") cond.$options = "i"; }
      else if (op === "isSet") cond.$exists = Boolean(arg);
      else throw new Error(`UNSUPPORTED_FILTER ${op} on ${key}`);
    }
    parts.push({ [field]: cond });
  }
  return parts.length === 0 ? {} : parts.length === 1 ? parts[0] : { $and: parts };
}

/** Extended JSON from the driver back to what Prisma returns: ids as strings, dates as Date. */
export function fromExtendedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fromExtendedJson);
  if (value && typeof value === "object") {
    const o = value as Doc;
    if (typeof o.$oid === "string") return o.$oid;
    if ("$date" in o) {
      const d = o.$date as unknown;
      return new Date(typeof d === "string" || typeof d === "number" ? d : Number((d as Doc).$numberLong));
    }
    if (typeof o.$numberLong === "string") return Number(o.$numberLong);
    if (typeof o.$numberDouble === "string") return Number(o.$numberDouble);
    if (typeof o.$numberInt === "string") return Number(o.$numberInt);
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fromExtendedJson(v)]));
  }
  return value;
}

type FindArgs = {
  where?: Prisma.CommunicationDeliveryWhereInput;
  select?: Partial<Record<keyof CommunicationDelivery, boolean>>;
  orderBy?: { createdAt: "asc" | "desc" };
  skip?: number;
  take?: number;
};

/** Drop-in for prisma.communicationDelivery.findMany (select / orderBy createdAt / skip / take). */
export async function rawFindDeliveries(args: FindArgs): Promise<CommunicationDelivery[]> {
  const keys = Object.entries(args.select ?? {}).filter(([, on]) => on).map(([k]) => k);
  const projection = keys.length ? Object.fromEntries(keys.map((k) => [k === "id" ? "_id" : k, 1])) : undefined;
  const docs = (await prisma.communicationDelivery.findRaw({
    filter: toMongoFilter(args.where as Where) as Prisma.InputJsonObject,
    options: {
      ...(projection ? { projection } : {}),
      ...(args.orderBy ? { sort: { createdAt: args.orderBy.createdAt === "asc" ? 1 : -1, _id: args.orderBy.createdAt === "asc" ? 1 : -1 } } : {}),
      ...(args.skip ? { skip: args.skip } : {}),
      ...(args.take ? { limit: args.take } : {}),
    } as Prisma.InputJsonObject,
  })) as unknown as Doc[];
  return docs.map((raw) => {
    const doc = fromExtendedJson(raw) as Doc;
    const row: Doc = { id: doc._id };
    for (const k of keys.length ? keys : Object.keys(doc)) if (k !== "id" && k !== "_id") row[k] = doc[k] ?? null;
    return row as unknown as CommunicationDelivery;
  });
}

async function rawCount(model: "communicationDelivery" | "communicationProviderEvent", where: Where | undefined): Promise<number> {
  const pipeline = [{ $match: toMongoFilter(where) }, { $count: "n" }] as Prisma.InputJsonValue[];
  const result = (model === "communicationDelivery"
    ? await prisma.communicationDelivery.aggregateRaw({ pipeline })
    : await prisma.communicationProviderEvent.aggregateRaw({ pipeline })) as unknown as Array<{ n: number }>;
  return Number(fromExtendedJson(result[0]?.n) ?? 0);
}

/** Drop-in for prisma.communicationDelivery.count({ where }). */
export const rawCountDeliveries = (args: { where?: Prisma.CommunicationDeliveryWhereInput }) => rawCount("communicationDelivery", args.where as Where);
/** Drop-in for prisma.communicationProviderEvent.count({ where }). */
export const rawCountProviderEvents = (args: { where?: Prisma.CommunicationProviderEventWhereInput }) => rawCount("communicationProviderEvent", args.where as Where);

/** Drop-in for prisma.communicationDelivery.groupBy({ by: [field], where, _count: { _all: true } }). */
export async function rawGroupByDeliveries(args: { by: ["status"] | ["templateName"]; where?: Prisma.CommunicationDeliveryWhereInput; _count: { _all: true } }): Promise<Array<{ status: string; templateName: string | null; _count: { _all: number } }>> {
  const field = args.by[0];
  const result = (await prisma.communicationDelivery.aggregateRaw({
    pipeline: [{ $match: toMongoFilter(args.where as Where) }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }] as Prisma.InputJsonValue[],
  })) as unknown as Array<{ _id: unknown; n: unknown }>;
  return result.map((g) => {
    const key = (fromExtendedJson(g._id) ?? null) as string | null;
    return { status: field === "status" ? String(key) : "", templateName: field === "templateName" ? key : null, _count: { _all: Number(fromExtendedJson(g.n)) } };
  });
}
