import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** GET / DELETE one saved AI reading of the concierge conversations. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "aiConcierge");
  if (denied) return denied;
  const { id } = await params;
  if (!OBJECT_ID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const insight = await prisma.aiConciergeInsight.findUnique({ where: { id } });
  if (!insight) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ insight }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "aiConcierge");
  if (denied) return denied;
  const { id } = await params;
  if (!OBJECT_ID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const deleted = await prisma.aiConciergeInsight.delete({ where: { id }, select: { id: true } }).catch(() => null);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
