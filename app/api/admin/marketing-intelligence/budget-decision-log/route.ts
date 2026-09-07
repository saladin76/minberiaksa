import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type JsonMap = Record<string, unknown>;

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function num(value: unknown) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value); return 0; }
function isMap(value: unknown): value is JsonMap { return typeof value === "object" && value !== null && !Array.isArray(value); }

async function ensureIndexes() {
  await prisma.$runCommandRaw({
    createIndexes: "MarketingBudgetDecisionLog",
    indexes: [
      { key: { createdAt: -1 }, name: "createdAt_desc" },
      { key: { decision: 1, createdAt: -1 }, name: "decision_createdAt" },
      { key: { sourceRecommendationId: 1 }, name: "sourceRecommendationId" },
    ],
  }).catch(() => null);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;
  await ensureIndexes();

  const limit = Math.max(1, Math.min(200, Math.floor(num(request.nextUrl.searchParams.get("limit")) || 50)));
  const result = await prisma.$runCommandRaw({ find: "MarketingBudgetDecisionLog", filter: {}, sort: { createdAt: -1 }, limit }) as JsonMap;
  const rows = isMap(result.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch : [];
  return NextResponse.json({ ok: true, rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;
  await ensureIndexes();

  const body = await request.json().catch(() => ({})) as JsonMap;
  const decision = text(body.decision).toUpperCase();
  if (!decision) return NextResponse.json({ ok: false, error: "missing decision" }, { status: 400 });

  const document = {
    sourceRecommendationId: text(body.sourceRecommendationId) || null,
    decision,
    title: text(body.title),
    reason: text(body.reason),
    action: text(body.action),
    note: text(body.note) || null,
    status: text(body.status).toUpperCase() || "IMPLEMENTED",
    metrics: isMap(body.metrics) ? body.metrics : {},
    createdAt: new Date(),
    createdBy: session?.user?.email || session?.user?.name || null,
  };

  const result = await prisma.$runCommandRaw({ insert: "MarketingBudgetDecisionLog", documents: [document] }) as JsonMap;
  return NextResponse.json({ ok: true, result });
}
