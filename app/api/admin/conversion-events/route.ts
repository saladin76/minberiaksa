import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { ensureConversionEventIndexes } from "@/lib/tracking/conversion-event-indexes";

export const dynamic = "force-dynamic";

type Query = Record<string, unknown>;

type AuditFallbackRow = {
  id: string;
  createdAt: Date;
  entityId: string | null;
  messageAr: string | null;
  metadata: unknown;
};

type ConversionEventLike = {
  _id?: unknown;
  eventId?: string;
  eventName?: string;
  platform?: string;
  channel?: string;
  status?: string;
  donationId?: string;
  value?: number | null;
  currency?: string | null;
  attempts?: number;
  error?: string | null;
  createdAt?: Date | string | { $date?: string };
  updatedAt?: Date | string | { $date?: string };
  response?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function stringParam(request: NextRequest, key: string): string | null {
  const value = request.nextUrl.searchParams.get(key);
  return value && value.trim() ? value.trim() : null;
}

function numberParam(request: NextRequest, key: string, fallback: number, max: number): number {
  const raw = Number(request.nextUrl.searchParams.get(key));
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(Math.floor(raw), max);
}

function metaString(metadata: unknown, key: string): string | null {
  if (!isRecord(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metaNumber(metadata: unknown, key: string): number | null {
  if (!isRecord(metadata)) return null;
  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function metaNested(metadata: unknown, key: string): unknown {
  return isRecord(metadata) ? metadata[key] : undefined;
}

function toDate(value: ConversionEventLike["createdAt"]): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (isRecord(value) && typeof value.$date === "string") {
    const date = new Date(value.$date);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function statusRank(status?: string) {
  if (status === "SENT") return 4;
  if (status === "FAILED") return 3;
  if (status === "SKIPPED") return 2;
  if (status === "PENDING") return 1;
  return 0;
}

function collapseEvents(rows: ConversionEventLike[]): ConversionEventLike[] {
  const map = new Map<string, ConversionEventLike>();
  for (const row of rows) {
    const key = [
      row.platform ?? "UNKNOWN",
      row.channel ?? "server",
      row.eventName ?? "Donate",
      row.eventId ?? row.donationId ?? "unknown",
    ].join("|");
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row, attempts: Math.max(1, Number(row.attempts ?? 1)) });
      continue;
    }
    const existingDate = toDate(existing.updatedAt) ?? toDate(existing.createdAt) ?? new Date(0);
    const rowDate = toDate(row.updatedAt) ?? toDate(row.createdAt) ?? new Date(0);
    const betterStatus = statusRank(row.status) > statusRank(existing.status) ? row.status : existing.status;
    const newest = rowDate >= existingDate ? row : existing;
    map.set(key, {
      ...existing,
      ...newest,
      status: betterStatus,
      attempts: Math.max(1, Number(existing.attempts ?? 1)) + Math.max(1, Number(row.attempts ?? 1)),
      error: newest.error ?? existing.error ?? null,
      value: newest.value ?? existing.value,
      currency: newest.currency ?? existing.currency,
    });
  }
  return [...map.values()].sort((a, b) => {
    const da = toDate(a.updatedAt) ?? toDate(a.createdAt) ?? new Date(0);
    const db = toDate(b.updatedAt) ?? toDate(b.createdAt) ?? new Date(0);
    return db.getTime() - da.getTime();
  });
}

function auditToEvent(row: AuditFallbackRow): ConversionEventLike {
  const metadata = row.metadata;
  const stage = metaString(metadata, "stage") ?? "conversion_audit";
  const eventId = metaString(metadata, "event_id") ?? metaString(metadata, "eventId") ?? row.entityId ?? row.id;
  const donationId = metaString(metadata, "donation_id") ?? metaString(metadata, "donationId") ?? row.entityId ?? undefined;
  const metaResult = metaNested(metadata, "meta_result");
  const status = isRecord(metaResult)
    ? (metaResult.ok === true ? "SENT" : metaResult.skipped === true ? "SKIPPED" : "FAILED")
    : stage.includes("result") ? "SENT" : "PENDING";
  return {
    _id: row.id,
    eventId,
    eventName: stage.includes("ga4") ? "purchase" : "Donate",
    platform: stage.includes("ga4") ? "GA4" : "META",
    channel: "server",
    status,
    donationId,
    value: metaNumber(metadata, "amount") ?? metaNumber(metadata, "value"),
    currency: metaString(metadata, "currency"),
    attempts: 1,
    error: isRecord(metaResult) && typeof metaResult.error === "string" ? metaResult.error : null,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
    response: metaResult ?? { source: "auditLog", stage, message: row.messageAr },
  };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  await ensureConversionEventIndexes();

  const platform = stringParam(request, "platform");
  const channel = stringParam(request, "channel");
  const status = stringParam(request, "status");
  const eventName = stringParam(request, "eventName");
  const donationId = stringParam(request, "donationId");
  const search = stringParam(request, "q");
  const limit = numberParam(request, "limit", 50, 200);
  const days = numberParam(request, "days", 7, 90);
  const from = parseDate(request.nextUrl.searchParams.get("from")) ?? new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const to = parseDate(request.nextUrl.searchParams.get("to")) ?? new Date();

  const clauses: Query[] = [
    {
      $or: [
        { createdAt: { $gte: from, $lte: to } },
        { updatedAt: { $gte: from, $lte: to } },
        { createdAt: { $exists: false } },
      ],
    },
  ];
  if (platform && platform !== "all") clauses.push({ platform });
  if (channel && channel !== "all") clauses.push({ channel });
  if (status && status !== "all") clauses.push({ status });
  if (eventName && eventName !== "all") clauses.push({ eventName });
  if (donationId) clauses.push({ donationId });
  if (search) {
    clauses.push({
      $or: [
        { eventId: { $regex: search, $options: "i" } },
        { eventName: { $regex: search, $options: "i" } },
        { donationId: { $regex: search, $options: "i" } },
        { error: { $regex: search, $options: "i" } },
      ],
    });
  }
  const filter: Query = clauses.length === 1 ? clauses[0] : { $and: clauses };

  const result = await prisma.$runCommandRaw({
    find: "ConversionEvent",
    filter,
    sort: { updatedAt: -1, createdAt: -1 },
    limit: limit * 5,
    projection: {
      eventId: 1,
      eventName: 1,
      platform: 1,
      channel: 1,
      status: 1,
      dedupKey: 1,
      donationId: 1,
      value: 1,
      currency: 1,
      attempts: 1,
      error: 1,
      sentAt: 1,
      createdAt: 1,
      updatedAt: 1,
      response: 1,
    },
  });

  let batch: ConversionEventLike[] = isRecord(result) && isRecord(result.cursor) && Array.isArray(result.cursor.firstBatch)
    ? result.cursor.firstBatch as ConversionEventLike[]
    : [];
  let source = "ConversionEvent";

  if (batch.length === 0) {
    const audits = await prisma.auditLog.findMany({
      where: {
        action: "CONVERSION_TRACKING_AUDIT",
        createdAt: { gte: from, lte: to },
        ...(donationId ? { entityId: donationId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit * 5,
      select: { id: true, createdAt: true, entityId: true, messageAr: true, metadata: true },
    });
    batch = audits.map(auditToEvent).filter((event) => {
      if (platform && platform !== "all" && event.platform !== platform) return false;
      if (channel && channel !== "all" && event.channel !== channel) return false;
      if (eventName && eventName !== "all" && event.eventName !== eventName) return false;
      if (search) {
        const haystack = `${event.eventId} ${event.eventName} ${event.donationId ?? ""} ${event.error ?? ""}`.toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      return true;
    });
    source = "auditLogFallback";
  }

  let collapsed = collapseEvents(batch);
  if (status && status !== "all") collapsed = collapsed.filter((event) => event.status === status);
  collapsed = collapsed.slice(0, limit);

  return NextResponse.json({
    ok: true,
    source,
    total: collapsed.length,
    rawTotal: batch.length,
    limit,
    from: from.toISOString(),
    to: to.toISOString(),
    filters: { platform, channel, status, eventName, donationId, search },
    events: collapsed,
  });
}
