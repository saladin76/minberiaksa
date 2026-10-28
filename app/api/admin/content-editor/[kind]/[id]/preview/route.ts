import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { CONFIG, parseKind } from "@/lib/content-editor/contracts";
import { readContent } from "@/lib/content-editor/service";
import { emptyWorkspace } from "@/lib/content-editor/create";
import { contentStore } from "@/lib/content-editor/store";
import { preparePreviewDraft } from "@/lib/content-editor/preview-draft";
import { isValidLocale } from "@/lib/locales";
import { getProject, getProjectDonorCount, listProjectUpdates } from "@/lib/minbar/projects";
import { getSuperCategory } from "@/lib/minbar/super-category";
import { getCategoryPage } from "@/lib/minbar/category-page";
import { getArticle } from "@/lib/minbar/posts";
import { pickNamespaces, SHELL_NAMESPACES } from "@/i18n/locale-messages";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) {
  const { kind: value, id } = await context.params, kind = parseKind(value);
  if (!kind || !["campaigns", "super-categories", "categories", "blog"].includes(kind) || (id !== "new" && !/^[a-f0-9]{24}$/i.test(id))) return NextResponse.json({ error: "المعاينة غير متاحة" }, { status: 404 });
  const denied = requireAdminOrDashboardPermission(await getServerSession(authOptions), CONFIG[kind].permission);
  if (denied) return denied;
  try {
    const text = await request.text();
    if (text.length > 2000000) return NextResponse.json({ error: "حجم المعاينة كبير جدًا" }, { status: 413 });
    const body = JSON.parse(text);
    if (!isValidLocale(body.locale)) throw new Error("لغة غير صالحة");
    const row = id === "new" ? { ...emptyWorkspace(kind), slug: "preview", seoNoIndex: "true", createdAt: new Date(), updatedAt: new Date(), categories: [], category: null } : await readContent(contentStore, kind, id);
    const draft = preparePreviewDraft(kind, row, body.locale, body.changes, body.settings);
    if (id === "new") draft.seed = row;
    const categoryWrite = draft.settings.categories as { set?: Array<{ id: string }> } | undefined;
    if (categoryWrite?.set) draft.settings.categories = await prisma.category.findMany({ where: { id: { in: categoryWrite.set.map(item => item.id) } }, select: { id: true, slug: true, name: true, translations: { select: { locale: true, name: true } } } });
    const page = kind === "campaigns" ? await getProject(id, body.locale, draft) : kind === "super-categories" ? await getSuperCategory(id, body.locale, draft) : kind === "categories" ? await getCategoryPage(id, body.locale, draft) : await getArticle(id, body.locale, draft);
    if (!page) return NextResponse.json({ error: "تعذر قراءة الصفحة للمعاينة" }, { status: 404 });
    const detail = kind === "campaigns" && id !== "new" ? await Promise.all([getProjectDonorCount(id), listProjectUpdates(id, body.locale)]).then(([donorCount, updates]) => ({donorCount, updates})) : null;
    return NextResponse.json({ kind, page, detail, messages: pickNamespaces(body.locale, [...SHELL_NAMESPACES, "cart", "homepage", "ProjectExtras", "blog", "CampaignsPage", "certificates", "CategoryLanding", "aqsa", "zakat", "quran"]) }, { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
  } catch {
    return NextResponse.json({ error: "تعذر تجهيز المعاينة. راجع الحقول وأعد المحاولة؛ لم تُحفظ أي تغييرات." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
