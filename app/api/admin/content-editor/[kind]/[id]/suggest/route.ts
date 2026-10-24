import { faqTranslationFields, translatedFaq } from "@/lib/content-editor/faq";
import { generateResearchedSeo, SeoResearchError } from "@/lib/content-editor/seo-research";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  CONFIG,
  fieldsFor,
  hasText,
  parseKind,
  valuesFor,
} from "@/lib/content-editor/contracts";
import { contentStore } from "@/lib/content-editor/store";
import { fingerprint, readContent } from "@/lib/content-editor/service";
import { translateResearchedItem } from "@/lib/content-localization/research-translate";
import { isValidLocale } from "@/lib/locales";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind: raw, id } = await ctx.params,
    kind = parseKind(raw);
  if (!kind || !/^[a-f0-9]{24}$/i.test(id))
    return NextResponse.json({ error: "قسم غير صالح" }, { status: 404 });
  const session = await getServerSession(authOptions),
    denied = requireAdminOrDashboardPermission(
      session,
      CONFIG[kind].permission,
    );
  if (denied) return denied;
  try {
    const body = await request.json();
    const row = await readContent(contentStore, kind, id);
    if (body.revision !== fingerprint(row))
      return NextResponse.json(
        { error: "تغير المحتوى. أعد تحميله قبل طلب اقتراح جديد." },
        { status: 409 },
      );
    const fields = fieldsFor(kind, row),
      source = valuesFor(kind, row, "ar");
    if (body.action === "translate") {
      if (
        !Array.isArray(body.locales) ||
        !body.locales.length ||
        body.locales.length !== 1 ||
        body.locales.some(
          (l: unknown) =>
            typeof l !== "string" || !isValidLocale(l) || l === "ar",
        )
      )
        return NextResponse.json(
          { error: "اختر لغات صالحة للترجمة" },
          { status: 400 },
        );
      const selected = fields.filter(
        (f) =>
          !f.locked &&
          !["seoNoIndex", "ogImage", "videoUrl"].includes(
            f.key,
          ) &&
          hasText(source[f.key]) &&
          (!Array.isArray(body.keys) || body.keys.includes(f.key)),
      );
      if (!selected.length)
        return NextResponse.json(
          { error: "لا يوجد نص قابل للترجمة" },
          { status: 400 },
        );
      const target = body.locales[0] as string;
      const researched = await translateResearchedItem(
        {
          fields: {
            ...Object.fromEntries(selected.filter((f) => !f.rich && f.key !== "faqContent").map((f) => [f.key, source[f.key]])),
            ...(selected.some((field) => field.key === "faqContent") ? faqTranslationFields(source.faqContent) : {}),
          },
          richFields: Object.fromEntries(
            selected.filter((f) => f.rich).map((f) => [f.key, source[f.key]]),
          ),
          itemLabel: CONFIG[kind].label,
          sourceLocale: "ar",
        },
        target,
        request.signal,
        typeof body.market === "string" ? body.market : undefined,
      );
      const result = { translations: { [target]: researched.translation }, errors: {} };
      return NextResponse.json(
        {
          id,
          kind,
          revision: body.revision,
          action: "translate",
          proposals: Object.fromEntries(
            Object.entries(result.translations).map(([locale, t]) => [
              locale,
              {
                values: {
                  ...Object.fromEntries(Object.entries(t.fields).filter(([key]) => !key.startsWith("__faq_"))),
                  ...t.richFields,
                  ...(selected.some((field) => field.key === "faqContent") && translatedFaq(source.faqContent, t.fields)
                    ? { faqContent: translatedFaq(source.faqContent, t.fields)! } : {}),
                },
                research: researched.research,
                warnings: [
                  ...t.warnings,
                  ...selected
                    .filter(
                      (f) => f.key === "faqContent" ? !translatedFaq(source.faqContent, t.fields) : !(f.key in t.fields) && !(f.key in t.richFields),
                    )
                    .map(
                      (f) =>
                        `لم يكتمل اقتراح حقل «${f.label}». تُرك دون تغيير.`,
                    ),
                ],
              },
            ]),
          ),
          errors: result.errors,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!["seo", "faq"].includes(body.action) || !isValidLocale(body.locale))
      return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
    const values = valuesFor(kind, row, body.locale);
    const context = fields.filter((field) => field.group === "content" && hasText(values[field.key]));
    if (!context.length)
      return NextResponse.json({ error: "احفظ محتوى هذه اللغة أولًا" }, { status: 400 });
    const seoFields = fields.filter((field) =>
      field.group === "seo" && !["seoNoIndex", "ogImage"].includes(field.key) &&
      (body.action !== "faq" || field.key === "faqContent"),
    );
    const generated = await generateResearchedSeo({
      type: kind === "blog" ? "blog" : kind === "categories" || kind === "super-categories" ? "category" : "campaign",
      locale: body.locale,
      title: values.title || values.name || values.question || "",
      description: context.map((field) => values[field.key]).join("\n"),
      keywords: values.seoKeyword ? [values.seoKeyword] : [],
    }, request.signal);
    const seo = generated.suggestion;
    const suggested: Record<string, string> = {
      seoTitle: seo.seoTitle, metaTitle: seo.seoTitle,
      seoDescription: seo.metaDescription, metaDescription: seo.metaDescription,
      seoKeyword: seo.primaryKeyword, imageAlt: seo.altText,
      ogTitle: seo.seoTitle, ogDescription: seo.metaDescription,
      ...(seo.faq.length ? { faqContent: JSON.stringify(seo.faq.map((item) => ({ q: item.question, a: item.answer }))) } : {}),
    };
    const proposed = Object.fromEntries(seoFields.filter((field) => suggested[field.key]?.trim()).map((field) => [field.key, suggested[field.key]]));
    if (!Object.keys(proposed).length)
      return NextResponse.json({ error: "لم تتوفر اقتراحات مدعومة بمحتوى هذه اللغة" }, { status: 422 });
    return NextResponse.json({
      id, kind, revision: body.revision, action: body.action,
      proposals: { [body.locale]: { values: proposed, warnings: seo.notes, research: generated.research } },
      errors: {},
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("content-editor suggestions", error);
    return NextResponse.json(
      { error: error instanceof SeoResearchError ? error.message : "تعذر إكمال الاقتراح. لم يتغير المحتوى المحفوظ." },
      { status: error instanceof SeoResearchError ? error.status : 502 },
    );
  }
}
