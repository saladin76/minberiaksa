import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { readProjectFilterRegistry } from "@/lib/minbar/project-filters";
import { auditActorFromDashboardSession, queueAuditLog } from "@/lib/audit-log";
import { isValidLocale } from "@/lib/locales";

type Registry = Awaited<ReturnType<typeof readProjectFilterRegistry>>;
function revision(registry: Registry) { return createHash("sha256").update(JSON.stringify({ keys: registry.items.map(row => row.key).sort(), order: registry.settings?.projectFilterOrder ?? null })).digest("hex"); }
async function authorize() { const session = await getServerSession(authOptions); return { session, denied: requireAdminOrDashboardPermission(session, "categories") || requireAdminOrDashboardPermission(session, "siteContent") }; }

export async function GET(request: NextRequest) {
  const { denied } = await authorize(); if (denied) return denied;
  try {
    const locale = request.nextUrl.searchParams.get("locale");
    const registry = await readProjectFilterRegistry(locale && isValidLocale(locale) ? locale : "ar", []);
    return NextResponse.json({ items: registry.items.map(({ key, name, kind }) => ({ key, name, kind })), revision: revision(registry) });
  } catch { return NextResponse.json({ error: "تعذر تحميل ترتيب فلاتر المشاريع" }, { status: 503 }); }
}

export async function PUT(request: NextRequest) {
  const { session, denied } = await authorize(); if (denied) return denied;
  try {
    const body = z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/), keys: z.array(z.string().regex(/^(category|programme):[a-f0-9]{24}$/i)).refine(keys => new Set(keys).size === keys.length) }).parse(await request.json());
    await prisma.$transaction(async tx => {
      const registry = await readProjectFilterRegistry("ar", [], tx);
      if (body.revision !== revision(registry) || body.keys.length !== registry.items.length || registry.items.some(item => !body.keys.includes(item.key))) throw new Error("PROJECT_FILTER_ORDER_CONFLICT");
      if (registry.settings) { const changed = await tx.globalSettings.updateMany({ where: { id: registry.settings.id, updatedAt: registry.settings.updatedAt }, data: { projectFilterOrder: body.keys } }); if (changed.count !== 1) throw new Error("PROJECT_FILTER_ORDER_CONFLICT"); }
      else await tx.globalSettings.create({ data: { projectFilterOrder: body.keys } });
    }, { timeout: 30_000 });
    queueAuditLog({ ...auditActorFromDashboardSession(session!), action: "PROJECT_FILTERS_REORDER", messageAr: "تحديث ترتيب التصنيفات والمشاريع الكبرى في صفحة المشاريع", entityType: "GlobalSettings", metadata: { count: body.keys.length } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "بيانات الترتيب غير صالحة" }, { status: 400 });
    if (error instanceof Error && error.message === "PROJECT_FILTER_ORDER_CONFLICT") return NextResponse.json({ error: "تغيرت القائمة أو ترتيبها. أعد تحميلها قبل الحفظ." }, { status: 409 });
    return NextResponse.json({ error: "تعذر حفظ ترتيب فلاتر المشاريع" }, { status: 503 });
  }
}
