import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { isValidLocale } from "@/lib/locales";
import { prisma } from "@/lib/prisma";
import { whereByIdOrAnyLocaleSlug } from "@/lib/slug";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";
import { parseCampaignFaqContent } from "@/lib/campaign/seo-fields";
import { publicCampaignImage } from "@/lib/minbar/project-image-fallback";
import { reviewSeoDraft } from "../../seo-dashboard-quality";

export const dynamic = "force-dynamic";

/**
 * SEO-only project adapter for the legacy workbench. Campaign content, slugs,
 * translations, donation amounts, payment and messaging are never written here.
 * The older /api/campaigns/[id]/seo endpoint does not exist in this repository.
 */
const KEYS = [
  "seoTitle", "seoDescription", "seoKeyword", "ogTitle", "ogDescription",
  "ogImage", "imageAlt", "seoNoIndex", "faqContent",
] as const;
type Key = typeof KEYS[number];
type Fields = Record<Key, string>;
const SELECT = Object.fromEntries(KEYS.map((key) => [key, true])) as Record<Key, true>;
const LIMITS: Record<Key, number> = {
  seoTitle: 160, seoDescription: 220, seoKeyword: 500, ogTitle: 180,
  ogDescription: 300, ogImage: 2048, imageAlt: 200, seoNoIndex: 5, faqContent: 25000,
};
type Params = { params: Promise<{ id: string }> };
type SeoDb = Pick<typeof prisma, "campaign">;

function fieldValues(row: Record<string, unknown>): Fields {
  return Object.fromEntries(KEYS.map((key) => [key, typeof row[key] === "string" ? row[key] : ""])) as Fields;
}
function snapshot(input: { id: string; locale: string; title: string; description: string; fields: Fields }): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function loadSeo(db: SeoDb, idOrSlug: string, locale: string) {
  const camp = await db.campaign.findFirst({
    where: { AND: [whereByIdOrAnyLocaleSlug(idOrSlug), NOT_SOFT_DELETED] },
    select: {
      id: true, title: true, description: true, slug: true, images: true, ...SELECT,
      translations: {
        where: { locale },
        take: 1,
        select: { id: true, locale: true, title: true, description: true, slug: true, image: true, ...SELECT },
      },
    },
  });
  if (!camp) return null;
  const trans = locale === "ar" ? null : camp.translations[0] || null;
  const hasTranslation = locale === "ar" || Boolean(trans);
  const values = fieldValues((trans || (locale === "ar" ? camp : {})) as unknown as Record<string, unknown>);
  const title = trans?.title || (locale === "ar" ? camp.title : "");
  const description = trans?.description || (locale === "ar" ? camp.description : "");
  return {
    campaignId: camp.id, locale, defaultSeo: fieldValues(camp as unknown as Record<string, unknown>),
    localeSeo: values, hasTranslation, contentTitle: title, contentDescription: description,
    slug: trans?.slug || camp.slug || "", defaultImage: publicCampaignImage([trans?.image, ...camp.images]),
    revision: hasTranslation ? snapshot({ id: camp.id, locale, title, description, fields: values }) : null,
    translationId: trans?.id || null,
  };
}

function parseFields(raw: unknown): { fields?: Fields; error?: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "SEO fields must be an object" };
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some((key) => !KEYS.includes(key as Key)))
    return { error: "Unsupported SEO field" };
  const fields = {} as Fields;
  for (const key of KEYS) {
    const value = body[key];
    if (typeof value !== "string" || value.length > LIMITS[key]) return { error: "Invalid or oversized SEO field: " + key };
    fields[key] = value.trim();
  }
  if (fields.seoNoIndex !== "" && fields.seoNoIndex !== "true" && fields.seoNoIndex !== "false")
    return { error: "seoNoIndex must be true or false" };
  try { fields.faqContent = parseCampaignFaqContent(fields.faqContent) || ""; }
  catch (error) { return { error: error instanceof Error ? error.message : "Invalid FAQ content" }; }
  return { fields };
}

async function access() {
  const session = await getServerSession(authOptions);
  return { session, denied: requireAdminOrDashboardPermission(session, "campaigns") };
}
function response(row: NonNullable<Awaited<ReturnType<typeof loadSeo>>>) {
  const { translationId: _translationId, ...rest } = row;
  return NextResponse.json(rest, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest, context: Params) {
  const { denied } = await access();
  if (denied) return denied;
  const locale = new URL(request.url).searchParams.get("locale") || "ar";
  if (!isValidLocale(locale)) return NextResponse.json({ error: "لغة غير مدعومة" }, { status: 400 });
  try {
    const row = await loadSeo(prisma, (await context.params).id, locale);
    return row ? response(row) : NextResponse.json({ error: "Project not found" }, { status: 404 });
  } catch (error) {
    console.error("Project SEO read failed", error);
    return NextResponse.json({ error: "تعذر تحميل SEO. لم يُعدّل أي محتوى." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: Params) {
  const { session, denied } = await access();
  if (denied) return denied;
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const input = body as Record<string, unknown>;
  const locale = input.locale;
  if (typeof locale !== "string" || !isValidLocale(locale))
    return NextResponse.json({ error: "لغة غير مدعومة" }, { status: 400 });
  if (typeof input.revision !== "string" || !/^[0-9a-f]{64}$/.test(input.revision))
    return NextResponse.json({ error: "يجب إعادة تحميل النسخة الحالية قبل الحفظ." }, { status: 409 });
  const parsed = parseFields(input.fields);
  if (!parsed.fields) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const fields = parsed.fields;
  const issues = reviewSeoDraft({
    locale, seoTitle: fields.seoTitle, metaDescription: fields.seoDescription,
    seoKeyword: fields.seoKeyword, ogTitle: fields.ogTitle, ogDescription: fields.ogDescription,
    ogImage: fields.ogImage, imageAlt: fields.imageAlt, seoNoIndex: fields.seoNoIndex,
    faqContent: fields.faqContent,
  });
  if (issues.some((issue) => issue.severity === "error"))
    return NextResponse.json({ error: "راجع أخطاء SEO قبل الحفظ.", issues }, { status: 422 });

  try {
    const id = (await context.params).id;
    const saved = await prisma.$transaction(async (tx) => {
      const row = await loadSeo(tx, id, locale);
      if (!row) return { status: 404, message: "Project not found" };
      if (!row.hasTranslation || !row.revision || row.revision !== input.revision)
        return { status: 409, message: "تغير محتوى اللغة أو لم تُنشأ ترجمتها بعد. أعد التحميل قبل الحفظ." };
      const patch = Object.fromEntries(KEYS.map((key) => [key, fields[key] || null]));
      if (locale === "ar") await tx.campaign.update({ where: { id: row.campaignId }, data: patch });
      else await tx.campaignTranslation.update({ where: { id: row.translationId! }, data: patch });
      return { status: 200, message: "", campaignId: row.campaignId };
    });
    if (saved.status !== 200) return NextResponse.json({ error: saved.message }, { status: saved.status });
    const latest = await loadSeo(prisma, saved.campaignId!, locale);
    if (!latest) return NextResponse.json({ error: "تعذر التحقق من النسخة المحفوظة." }, { status: 500 });
    queueAuditLog({
      ...auditActorFromDashboardSession(session!), action: "PROJECT_SEO_SAVE",
      entityType: "Campaign", entityId: saved.campaignId!,
      messageAr: "تحديث SEO المشروع", metadata: { locale, fields: [...KEYS] },
    });
    revalidatePath("/", "layout");
    return response(latest);
  } catch (error) {
    console.error("Project SEO save failed", error);
    return NextResponse.json({ error: "تعذر تأكيد حفظ SEO. أعد التحميل قبل إعادة المحاولة." }, { status: 500 });
  }
}
