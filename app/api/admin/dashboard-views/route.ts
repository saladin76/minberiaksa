import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Saved filter sets for the home dashboard (owner, 2026-11-21): the author's own, plus those shared with the team. */
const COLLECTION = "DashboardSavedView";
type Raw = { _id: { $oid: string } | string; name: string; filters: Record<string, string>; shared?: boolean; ownerId?: string; ownerName?: string | null };
const rid = (v: Raw["_id"]) => (typeof v === "string" ? v : v.$oid);
const KEYS = ["selectedCategory", "selectedCampaign", "donationSourceFilter", "donationLocaleFilter", "donationCountryFilter", "donationProviderFilter", "donationsStatusFilter", "donationsTypeFilter", "chartPeriod", "dateFrom", "dateTo"];

async function gate() {
  const session = await getServerSession(authOptions);
  return { session, denied: requireAdminOrDashboardPermission(session, "revenue") };
}

export async function GET() {
  const { session, denied } = await gate();
  if (denied) return denied;
  const me = session?.user?.id ?? "";
  const res = (await prisma.$runCommandRaw({ find: COLLECTION, filter: { $or: [{ ownerId: me }, { shared: true }] }, sort: { name: 1 }, limit: 200 })) as unknown as { cursor?: { firstBatch?: Raw[] } };
  const views = (res.cursor?.firstBatch ?? []).map((v) => ({ id: rid(v._id), name: v.name, filters: v.filters, shared: v.shared === true, mine: v.ownerId === me, ownerName: v.ownerName ?? null }));
  return NextResponse.json({ views }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const { session, denied } = await gate();
  if (denied) return denied;
  const input = (await request.json().catch(() => ({}))) as { name?: unknown; filters?: unknown; shared?: unknown };
  const name = String(input.name ?? "").trim().slice(0, 80);
  const raw = input.filters && typeof input.filters === "object" ? (input.filters as Record<string, unknown>) : {};
  const filters = Object.fromEntries(KEYS.filter((k) => typeof raw[k] === "string").map((k) => [k, String(raw[k]).slice(0, 2000)]));
  if (!name || Object.keys(filters).length === 0) return NextResponse.json({ error: "INVALID_VIEW" }, { status: 400 });
  await prisma.$runCommandRaw({ insert: COLLECTION, documents: [{ name, filters, shared: input.shared === true, ownerId: session?.user?.id ?? null, ownerName: session?.user?.name ?? null, createdAt: { $date: new Date().toISOString() } }] });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { session, denied } = await gate();
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f]{24}$/i.test(id)) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  // Only the author removes a view (a shared one included).
  await prisma.$runCommandRaw({ delete: COLLECTION, deletes: [{ q: { _id: { $oid: id }, ownerId: session?.user?.id ?? "" }, limit: 1 }] });
  return NextResponse.json({ ok: true });
}
