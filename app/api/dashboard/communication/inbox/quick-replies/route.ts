import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Team-shared quick replies for the WhatsApp conversations page (owner, 2026-11-19), per language
 * (ar / tr / fr / en, or "all"). Stored in InboxQuickReply; anyone who can open the inbox can use, add and remove them.
 */
const LANGS = new Set(["ar", "tr", "fr", "en", "all"]);
const COLLECTION = "InboxQuickReply";
type Raw = { _id: { $oid: string } | string; language: string; title: string; body: string; createdByName?: string | null };
const id = (v: Raw["_id"]) => (typeof v === "string" ? v : v.$oid);

async function gate() {
  const session = await getServerSession(authOptions);
  return { session, denied: requireAdminOrDashboardPermission(session, "messages") };
}

export async function GET(request: NextRequest) {
  const { denied } = await gate();
  if (denied) return denied;
  const lang = request.nextUrl.searchParams.get("language") ?? "";
  const filter = LANGS.has(lang) && lang !== "all" ? { language: { $in: [lang, "all"] } } : {};
  const res = (await prisma.$runCommandRaw({ find: COLLECTION, filter, sort: { title: 1 }, limit: 200 })) as unknown as { cursor?: { firstBatch?: Raw[] } };
  const replies = (res.cursor?.firstBatch ?? []).map((r) => ({ id: id(r._id), language: r.language, title: r.title, body: r.body, createdByName: r.createdByName ?? null }));
  return NextResponse.json({ replies }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const { session, denied } = await gate();
  if (denied) return denied;
  const input = (await request.json().catch(() => ({}))) as { language?: string; title?: string; body?: string };
  const language = String(input.language ?? ""), title = String(input.title ?? "").trim(), body = String(input.body ?? "").trim();
  if (!LANGS.has(language) || !title || !body || title.length > 60 || body.length > 1000) return NextResponse.json({ error: "INVALID_QUICK_REPLY" }, { status: 400 });
  await prisma.$runCommandRaw({ insert: COLLECTION, documents: [{ language, title, body, createdById: session?.user?.id ?? null, createdByName: session?.user?.name ?? null, createdAt: { $date: new Date().toISOString() } }] });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { denied } = await gate();
  if (denied) return denied;
  const rid = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f]{24}$/i.test(rid)) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  await prisma.$runCommandRaw({ delete: COLLECTION, deletes: [{ q: { _id: { $oid: rid } }, limit: 1 }] });
  return NextResponse.json({ ok: true });
}
