import { composeField } from "@/lib/content-editor/compose";
import { emptyWorkspace } from "@/lib/content-editor/create";
import { queueSuggestion } from "@/lib/content-editor/suggestion-tasks";
import { suggestionFailure } from "@/lib/ai/core/suggestion-failure";
import { parseGa4Period } from "@/lib/marketing/ga4-period";
import { loadGa4DashboardReport } from "@/lib/marketing/ga4-server";
import { ga4ContentPagePath, ga4SeoEvidence } from "@/lib/marketing/ga4-seo";
import { faqTranslationFields, translatedFaq } from "@/lib/content-editor/faq";
import { generateResearchedSeo, SeoResearchError } from "@/lib/content-editor/seo-research";
import { seoSourceText } from "@/lib/content-editor/seo-source";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  CONFIG,
  fieldsFor,
  hasText,
  parseKind,
  valuesFor,
  validateChanges,
  contentFieldLimit,
  changedTextValues,
} from "@/lib/content-editor/contracts";
import { translateItem } from "@/lib/content-localization/translate";
import { contentStore } from "@/lib/content-editor/store";
import { ContentError, documentFor, fingerprint, readContent } from "@/lib/content-editor/service";
import { isValidLocale } from "@/lib/locales";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
type SuggestionContext = { params: Promise<{ kind: string; id: string }> };

// after() cannot read request cookies. Authenticate once while the request is open.
async function suggestWithSession(
  request: NextRequest, ctx: SuggestionContext, session: Session | null,
): Promise<Response> {
  const { kind: raw, id } = await ctx.params,
    kind = parseKind(raw);
  if (!kind || (id !== "new" && !/^[a-f0-9]{24}$/i.test(id)))
    return NextResponse.json({ error: "قسم غير صالح" }, { status: 404 });
  const denied = requireAdminOrDashboardPermission(
      session,
      CONFIG[kind].permission,
    );
  if (denied) return denied;
  try {
    if (request.headers?.get("Prefer") === "respond-async") {
      if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      return await queueSuggestion(request, session.user.id, CONFIG[kind].permission, detached => suggestWithSession(detached, ctx, session), { denied: requireAdminOrDashboardPermission(session, "platformConnections") });
    }
    const body = await request.json();
    const row = id === "new" ? emptyWorkspace(kind) : await readContent(contentStore, kind, id);
    if (body.revision !== fingerprint(row))
      return NextResponse.json(
        { error: "تغير المحتوى. أعد تحميله قبل طلب اقتراح جديد." },
        { status: 409 },
      );
    const fields = fieldsFor(kind, row);
    const draftValues = (value: unknown, locale: string) => {
      if (value === undefined) return valuesFor(kind, row, locale);
      try {
        const saved = valuesFor(kind, row, locale);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("حقول المسودة غير صالحة");
        return { ...saved, ...validateChanges(fields, changedTextValues(value as Record<string, string>, saved)) };
      } catch (error) { throw new ContentError(error instanceof Error ? error.message : "حقول المسودة غير صالحة. راجع الحقول قبل طلب الاقتراح."); }
    };
    if (body.action === "compose") {
      if (!isValidLocale(body.locale)) throw new ContentError("اختر لغة صالحة للاقتراح");
      const field = fields.find(field => field.key === body.field && field.group === "content" && !field.locked && (field.rich || ["title", "name", "question", "answer", "description", "text", "subtitle", "summary"].includes(field.key)));
      if (!field) throw new ContentError("اختر حقلًا نصيًا صالحًا للاقتراح");
      if (typeof body.brief !== "string" || body.brief.length > 2000) throw new ContentError("توجيهات الاقتراح يجب ألا تتجاوز 2000 حرف");
      const draft = draftValues(body.draft, body.locale);
      const sourceDraft = draftValues(body.sourceDraft, "ar");
      if (!body.brief.trim() && !fields.some(field => field.group === "content" && !field.locked && (hasText(draft[field.key]) || hasText(sourceDraft[field.key]))))
        throw new ContentError("أضف معلومات عن المشروع أو توجيهات للاقتراح أولًا");
      const value = await composeField({ field, locale: body.locale, values: draft, sourceValues: sourceDraft, brief: body.brief, signal: request.signal });
      const values = validateChanges(fields, { [field.key]: value });
      return NextResponse.json({ id, kind, revision: body.revision, action: "compose", proposals: {
        [body.locale]: { values, warnings: [] },
      }, errors: {} }, { headers: { "Cache-Control": "no-store" } });
    }
    const source = body.action === "proofread" ? valuesFor(kind, row, "ar") : draftValues(body.sourceDraft, "ar");
    if (body.action === "proofread") {
      if (!isValidLocale(body.locale))
        return NextResponse.json({ error: "اختر لغة صالحة للتدقيق" }, { status: 400 });
      const draft = draftValues(body.draft, body.locale);
      const selected = fields.filter(field => field.group === "content" && !field.locked && hasText(draft[field.key]) && (!Array.isArray(body.keys) || body.keys.includes(field.key)));
      if (!selected.length) return NextResponse.json({ error: "لا يوجد نص قابل للتدقيق في الحقول المحددة" }, { status: 400 });
      const result = await translateItem({
        mode: "proofread", sourceLocale: body.locale, signal: request.signal,
        itemLabel: CONFIG[kind].label,
        fields: Object.fromEntries(selected.filter(field => !field.rich).map(field => [field.key, draft[field.key]])),
        richFields: Object.fromEntries(selected.filter(field => field.rich).map(field => [field.key, draft[field.key]])),
      }, body.locale);
      if (!Object.keys(result.fields).length && !Object.keys(result.richFields).length)
        return NextResponse.json({ error: "لم يُنتج التدقيق نصًا صالحًا للمراجعة. المحتوى لم يتغير." }, { status: 422 });
      return NextResponse.json({ id, kind, revision: body.revision, action: "proofread", proposals: {
        [body.locale]: { values: { ...result.fields, ...result.richFields }, warnings: result.warnings },
      }, errors: {} }, { headers: { "Cache-Control": "no-store" } });
    }
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
      const translation = await translateItem(
        {
          fields: {
            ...Object.fromEntries(selected.filter((f) => !f.rich && f.key !== "faqContent").map((f) => [f.key, source[f.key]])),
            ...(selected.some((field) => field.key === "faqContent") ? faqTranslationFields(source.faqContent) : {}),
          },
          richFields: Object.fromEntries(
            selected.filter((f) => f.rich).map((f) => [f.key, source[f.key]]),
          ),
          itemLabel: CONFIG[kind].label,
          fieldLimits: {
            ...Object.fromEntries(selected.filter(field => !field.rich && field.group === "seo" && field.key !== "faqContent").map(field => [field.key, contentFieldLimit(field.key)])),
            ...(selected.some(field => field.key === "faqContent") ? Object.fromEntries(Object.keys(faqTranslationFields(source.faqContent)).map(key => [key, key.endsWith("_q") ? 500 : 5000])) : {}),
          },
          sourceLocale: "ar",
          signal: request.signal,
        },
        target,
      );
      const result = { translations: { [target]: translation }, errors: {} };
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
                research: { sources: [] },
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
    const values = source;
    const context = fields.filter((field) => field.group === "content" && hasText(values[field.key]));
    if (!context.length)
      return NextResponse.json({ error: "اكتب المحتوى بالعربية أولًا ثم اطلب اقتراحات SEO أو الأسئلة الشائعة." }, { status: 400 });
    const seoFields = fields.filter((field) =>
      field.group === "seo" && !["seoNoIndex", "ogImage"].includes(field.key) &&
      (body.action !== "faq" || field.key === "faqContent"),
    );
    let analyticsEvidence;
    if (body.analyticsPeriod && body.action === "seo") {
      const gaDenied = requireAdminOrDashboardPermission(session, "platformConnections"); if (gaDenied) return gaDenied;
      let period; try { period = parseGa4Period(body.analyticsPeriod); } catch { return NextResponse.json({ error: "فترة GA4 غير صالحة" }, { status: 400 }); }
      const data = await loadGa4DashboardReport(period);
      const slug = documentFor(kind, row).slugs[body.locale];
      const pagePath = ga4ContentPagePath(kind, body.locale, slug);
      if (!pagePath) return NextResponse.json({error: "GA4_PAGE_UNAVAILABLE"}, {status: 400});
      analyticsEvidence = ga4SeoEvidence(data.report, period, pagePath);
    }
    const generated = await generateResearchedSeo({
      type: kind === "blog" ? "blog" : kind === "categories" || kind === "super-categories" ? "category" : "campaign",
      locale: body.locale,
      analyticsEvidence,
      title: values.title || values.name || values.question || "",
      description: context.filter(field => !field.locked).map((field) => seoSourceText(values[field.key])).join("\n\n"),
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
    const failure = suggestionFailure(error);
    if (failure) return NextResponse.json({ error: failure.error, reason: failure.reason, details: failure.details, stopBatch: failure.stopBatch }, { status: failure.status });
    if (error instanceof ContentError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("content-editor suggestions failed");
    return NextResponse.json(
      { error: error instanceof SeoResearchError ? error.message : "تعذر إكمال الاقتراح. لم يتغير المحتوى المحفوظ.", ...(error instanceof SeoResearchError ? { reason: error.reason, validation: error.validation } : {}) },
      { status: error instanceof SeoResearchError ? error.status : 502 },
    );
  }
}

export async function POST(request: NextRequest, ctx: SuggestionContext): Promise<Response> {
  let session: Session | null;
  try { session = await getServerSession(authOptions); }
  catch { return NextResponse.json({ error: "تعذر التحقق من جلسة الدخول. احتفظ بالمسودة وأعد المحاولة.", reason: "SUGGESTION_SESSION_UNAVAILABLE" }, { status: 503 }); }
  return suggestWithSession(request, ctx, session);
}

