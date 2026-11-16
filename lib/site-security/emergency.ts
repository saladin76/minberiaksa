import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EMERGENCY_PAGE, type EmergencyMode, isEmergencyAllowedPath, isEmergencyMode, isPaymentStartRequest } from "./emergency-policy";
import { pauseTexts, requestLocale } from "./emergency-texts";

export const EMERGENCY_COLLECTION = "SiteEmergencyMode";
export type EmergencyState = { mode: EmergencyMode; changedAt: string | null; changedBy: string | null };
const OFF: EmergencyState = { mode: "OFF", changedAt: null, changedBy: null };
let cached: { expires: number; state: EmergencyState } | null = null;

export function clearEmergencyCache() { cached = null; }

/** Cached 5 s like the access rules. A read problem keeps the last known state; with none, OFF (never closes by accident). */
export async function readEmergency(): Promise<EmergencyState> {
  if (cached && cached.expires > Date.now()) return cached.state;
  try {
    const result = await Promise.race([
      prisma.$runCommandRaw({ find: EMERGENCY_COLLECTION, filter: { _id: "site" }, limit: 1, maxTimeMS: 1000 } as Prisma.InputJsonObject),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("EMERGENCY_READ_TIMEOUT")), 1000)),
    ]);
    const row = (result as { cursor?: { firstBatch?: Record<string, unknown>[] } }).cursor?.firstBatch?.[0];
    const state: EmergencyState = row
      ? { mode: isEmergencyMode(row.mode) ? row.mode : "OFF", changedAt: typeof row.changedAt === "string" ? row.changedAt : null, changedBy: typeof row.changedBy === "string" ? row.changedBy : null }
      : OFF;
    cached = { expires: Date.now() + 5000, state };
    return state;
  } catch {
    return cached?.state ?? OFF;
  }
}

export async function writeEmergency(mode: EmergencyMode, changedBy: string): Promise<EmergencyState> {
  const state: EmergencyState = { mode, changedAt: new Date().toISOString(), changedBy };
  await prisma.$runCommandRaw({ update: EMERGENCY_COLLECTION, updates: [{ q: { _id: "site" }, u: { $set: state }, upsert: true }] } as Prisma.InputJsonObject);
  cached = { expires: Date.now() + 5000, state };
  return state;
}

/** Called first in checkSiteAccess: a refusal, or null to continue normally. */
export async function emergencyResponse(request: NextRequest): Promise<NextResponse | null> {
  const path = request.nextUrl.pathname;
  const payment = isPaymentStartRequest(request.method, path);
  if (!payment && isEmergencyAllowedPath(path)) return null;
  const { mode } = await readEmergency();
  if (mode === "OFF") return null;
  const headers = { "Cache-Control": "no-store", "Retry-After": "600" };
  if (payment) {
    const locale = requestLocale(request.cookies.get("NEXT_LOCALE")?.value, request.headers.get("referer"));
    return NextResponse.json({ error: pauseTexts(locale).refused, code: "DONATIONS_PAUSED" }, { status: 503, headers });
  }
  if (mode !== "SITE") return null;
  return path.startsWith("/api/")
    ? NextResponse.json({ error: "SITE_MAINTENANCE" }, { status: 503, headers })
    : new NextResponse(EMERGENCY_PAGE, { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}
