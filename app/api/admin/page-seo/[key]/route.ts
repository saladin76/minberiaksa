import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { ContentError } from "@/lib/content-editor/service";
import { pageSeoDefaults, readPageSeoDocument, savePageSeoDocument } from "@/lib/content-editor/page-seo";
import { generateResearchedSeo, SeoResearchError } from "@/lib/content-editor/seo-research";
import { isValidLocale } from "@/lib/locales";
import { revalidatePath } from "next/cache";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Context = { params: Promise<{ key: string }> };
async function access() { const session = await getServerSession(authOptions); return { session, denied: requireAdminOrDashboardPermission(session, "siteContent") }; }
function failure(error: unknown) {
  if (error instanceof ContentError || error instanceof SeoResearchError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("managed-page-seo operation failed");
  return NextResponse.json({ error: "تعذر تأكيد العملية. احتفظ بالمسودة وأعد المحاولة." }, { status: 500 });
}
export async function GET(_request: NextRequest, ctx: Context) {
  const { denied } = await access(); if (denied) return denied;
  try { return NextResponse.json(await readPageSeoDocument((await ctx.params).key), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
export async function PUT(request: NextRequest, ctx: Context) {
  const { session, denied } = await access(); if (denied) return denied;
  try {
    const { key } = await ctx.params, body = await request.json();
    if (body.revision !== null && typeof body.revision !== "string") throw new ContentError("أعد تحميل الصفحة أولًا");
    const saved = await savePageSeoDocument(key, body.revision, body.overrides);
    queueAuditLog({ ...auditActorFromDashboardSession(session!), action: "PAGE_SEO_SAVE", entityType: "ManagedPageSeo", entityId: key, messageAr: "حفظ إعدادات بحث الصفحة", metadata: { locales: Object.keys(saved.overrides) } });
    revalidatePath("/", "layout"); revalidatePath("/sitemap.xml"); revalidatePath("/sitemap/static");
    return NextResponse.json(saved);
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, ctx: Context) {
  const { denied } = await access(); if (denied) return denied;
  try {
    const { key } = await ctx.params, body = await request.json();
    if (!isValidLocale(body.locale)) throw new ContentError("لغة غير صالحة");
    const document = await readPageSeoDocument(key);
    if (document.revision !== body.revision) throw new ContentError("تغيرت إعدادات الصفحة. أعد تحميلها أولًا.", 409);
    const source = pageSeoDefaults(key, body.locale);
    const result = await generateResearchedSeo({ type: "page", locale: body.locale, title: source.values.metaTitle, description: source.values.metaDescription + "\n" + source.context, market: typeof body.market === "string" ? body.market : undefined }, request.signal);
    return NextResponse.json({ key, locale: body.locale, revision: document.revision, values: { metaTitle: result.suggestion.seoTitle, metaDescription: result.suggestion.metaDescription, seoKeyword: result.suggestion.primaryKeyword, imageAlt: result.suggestion.altText, ogTitle: result.suggestion.seoTitle, ogDescription: result.suggestion.metaDescription }, research: result.research });
  } catch (error) { return failure(error); }
}
