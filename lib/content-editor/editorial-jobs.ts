import { getOpenAiRuntime } from "../ai/core/connection-settings";
import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { messagesFor } from "../../i18n/locale-messages";
import { SUPPORTED_LOCALES } from "../locales";
import { fieldsFor, hasText, statuses, validateChanges, valuesFor, type ContentRecord, type TextValues } from "./contracts";
import { ContentError, fingerprint, readContent, saveWorkspace } from "./service";
import { contentStore } from "./store";
import { createWorkspace } from "./create";
import { faqTranslationFields, translatedFaq } from "./faq";
import { translateResearchedItem } from "../content-localization/research-translate";
import { generateResearchedArticle } from "./seo-research";
import { editorialWeekKey, isDuplicateEditorialTopic, type EditorialJobKind } from "./editorial-contracts";
import { editorialFailure, selectEditorialRetries, summarizeEditorialFailures, type EditorialFailureKind } from "./editorial-failure";
import { suggestionFailure } from "../ai/core/suggestion-failure";

const json = (value: unknown) => value as Prisma.InputJsonValue;
const EDITABLE = new Set(["title", "description", "content", "metaTitle", "metaDescription", "seoKeyword", "ogTitle", "ogDescription", "imageAlt", "faqContent"]);
/** Bounded, read-only diagnostics. Historical failure reasons do not prove current readiness. */
export async function editorialFailureReview(reason?: EditorialFailureKind) {
  const jobs = await prisma.editorialJob.findMany({ where: { status: "FAILED" }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: 1001, select: { id: true, error: true, attempts: true, updatedAt: true } });
  const sampled = jobs.slice(0, 1000);
  return { summary: { ...summarizeEditorialFailures(sampled), truncated: jobs.length > 1000 },
    matchingIds: reason ? sampled.filter(job => editorialFailure(job.error).kind === reason).map(job => job.id) : undefined };
}
export async function editorialSettings() {
  const settings = await prisma.editorialSettings.findUnique({ where: { id: "plan" } });
  return { weeklyEnabled: settings?.weeklyEnabled ?? true, market: settings?.market || "", configured: Boolean((await getOpenAiRuntime("content")).apiKey) };
}
export async function saveEditorialSettings(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ContentError("إعدادات غير صالحة");
  const value = input as Record<string, unknown>;
  if (typeof value.weeklyEnabled !== "boolean" || typeof value.market !== "string" || value.market.length > 120) throw new ContentError("إعدادات غير صالحة");
  const data = { weeklyEnabled: value.weeklyEnabled, market: value.market };
  await prisma.editorialSettings.upsert({ where: { id: "plan" }, create: { id: "plan", ...data }, update: data });
  return editorialSettings();
}
async function enqueue(input: { key: string; kind: EditorialJobKind; locale: string; sourceId?: string; sourceRevision?: string; targetRevision?: string; fields?: string[] }) {
  try { await prisma.editorialJob.create({ data: { ...input, priority: input.kind === "ARTICLE" ? 0 : input.kind === "IMPROVE_ARTICLE" ? 5 : 10, fields: input.fields ? json(input.fields) : undefined } }); return true; }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return false;
    throw error;
  }
}
export async function enqueueWeeklyArticle(date = new Date()) {
  return enqueue({ key: "article:" + editorialWeekKey(date), kind: "ARTICLE", locale: "ar" });
}
export async function enqueueArticleImprovement(id: string) {
  const row = await readContent(contentStore, "blog", id), revision = fingerprint(valuesFor("blog", row, "ar"));
  return enqueue({ key: "improve:" + id + ":" + revision, kind: "IMPROVE_ARTICLE", locale: "ar", sourceId: id, sourceRevision: revision, targetRevision: revision });
}
export async function enqueueMissingArticleTranslations(cursor?: string) {
  if (cursor && !/^[a-f0-9]{24}$/i.test(cursor)) throw new ContentError("مؤشر غير صالح");
  const posts = await prisma.post.findMany({ include: { translations: true }, orderBy: { id: "asc" }, take: 11, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
  let created = 0, existing = 0, skipped = 0;
  for (const post of posts.slice(0, 10)) {
    const row = post as unknown as ContentRecord, source = valuesFor("blog", row, "ar");
    if (!hasText(source.title) || !hasText(source.content)) { skipped++; continue; }
    const revision = fingerprint(source), coverage = statuses("blog", row);
    for (const locale of SUPPORTED_LOCALES.filter((locale) => locale !== "ar")) {
      const missing = coverage[locale].missing;
      if (!missing.length) continue;
      const targetRevision = fingerprint(valuesFor("blog", row, locale));
      const ok = await enqueue({ key: "translate:" + post.id + ":" + locale + ":" + revision + ":" + targetRevision,
        kind: "TRANSLATION", locale, sourceId: post.id, sourceRevision: revision, targetRevision, fields: missing });
      if (ok) created++; else existing++;
    }
  }
  return { created, existing, skipped, nextCursor: posts.length > 10 ? posts[9].id : null };
}
function translationInput(row: ContentRecord, requested: unknown) {
  const source = valuesFor("blog", row, "ar"), keys = Array.isArray(requested) ? requested.filter((key): key is string => typeof key === "string") : [];
  const selected = fieldsFor("blog", row).filter((field) => !field.locked && EDITABLE.has(field.key) && keys.includes(field.key) && hasText(source[field.key]));
  return {
    selected,
    input: { sourceLocale: "ar", itemLabel: "مقال: " + source.title,
      fields: { ...Object.fromEntries(selected.filter((field) => !field.rich && field.key !== "faqContent").map((field) => [field.key, source[field.key]])), ...(selected.some((field) => field.key === "faqContent") ? faqTranslationFields(source.faqContent) : {}) },
      richFields: Object.fromEntries(selected.filter((field) => field.rich).map((field) => [field.key, source[field.key]])),
    },
  };
}
async function institutionalContext() {
  const campaigns = await prisma.campaign.findMany({ where: { isActive: true, OR: [{ isDeleted: false }, { isDeleted: { isSet: false } }] }, select: { title: true, description: true }, take: 12, orderBy: { createdAt: "desc" } });
  return JSON.stringify({ about: messagesFor("ar").about, campaigns });
}
async function existingTopics() {
  const [posts, proposals] = await Promise.all([
    prisma.post.findMany({ select: { id: true, title: true, slug: true }, orderBy: { createdAt: "asc" } }),
    prisma.editorialJob.findMany({ where: { kind: "ARTICLE", status: { in: ["REVIEW", "APPLIED"] } }, select: { result: true } }),
  ]);
  return { posts, pendingTitles: proposals.map((job) => String((job.result as { values?: { title?: string } } | null)?.values?.title || "")).filter(Boolean) };
}
export async function runEditorialJobs(signal?: AbortSignal, maximum = 2) {
  const now = new Date(), runnerToken = randomUUID();
  await prisma.editorialSettings.upsert({ where: { id: "plan" }, create: { id: "plan" }, update: {} });
  const runner = await prisma.editorialSettings.updateMany({ where: { id: "plan", OR: [{ leaseUntil: null }, { leaseUntil: { isSet: false } }, { leaseUntil: { lt: now } }] }, data: { leaseToken: runnerToken, leaseUntil: new Date(now.getTime() + 15 * 60000) } });
  if (!runner.count) return [];
  try {
  const candidates = await prisma.editorialJob.findMany({ where: { OR: [{ status: "QUEUED" }, { status: "RUNNING", leaseUntil: { lt: now } }] }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }], take: Math.max(1, Math.min(maximum, 2)) });
  const settings = await editorialSettings();
  if (!settings.configured) return [];
  return await Promise.all(candidates.map(async (candidate) => {
    const leaseToken = randomUUID(), version = randomUUID();
    const claim = await prisma.editorialJob.updateMany({ where: { id: candidate.id, version: candidate.version, OR: [{ status: "QUEUED" }, { status: "RUNNING", leaseUntil: { lt: now } }] }, data: { status: "RUNNING", leaseToken, leaseUntil: new Date(now.getTime() + 15 * 60000), attempts: { increment: 1 }, error: null, version } });
    if (!claim.count) return { id: candidate.id, status: "SKIPPED" };
    try {
      signal?.throwIfAborted();
      let result: unknown;
      const source = candidate.sourceId ? await readContent(contentStore, "blog", candidate.sourceId) : null;
      if (source && (fingerprint(valuesFor("blog", source, "ar")) !== candidate.sourceRevision || fingerprint(valuesFor("blog", source, candidate.locale)) !== candidate.targetRevision)) throw new ContentError("تغير المصدر أو ترجمة هذه اللغة. أعد تجهيز المهمة من النسخة الحالية.", 409);
      if (candidate.kind === "TRANSLATION") {
        if (!source) throw new ContentError("المقال غير موجود", 404);
        const { selected, input } = translationInput(source, candidate.fields);
        if (!selected.length) throw new ContentError("لم تعد هناك حقول ناقصة لهذه المهمة", 409);
        const generated = await translateResearchedItem(input, candidate.locale, signal, settings.market);
        const translated = generated.translation;
        const faq = translatedFaq(valuesFor("blog", source, "ar").faqContent, translated.fields);
        const values: TextValues = { ...Object.fromEntries(Object.entries(translated.fields).filter(([key]) => !key.startsWith("__faq_"))), ...translated.richFields, ...(faq ? { faqContent: faq } : {}) };
        if (selected.some((field) => !hasText(values[field.key]))) throw new ContentError("الترجمة غير مكتملة. لم تُعتمد حقول جزئية.");
        result = { values, notes: translated.warnings, research: generated.research };
      } else {
        const topics = await existingTopics();
        const existingTitles = [...topics.posts.filter((post) => post.id !== candidate.sourceId).map((post) => post.title || post.slug || ""), ...topics.pendingTitles];
        const generated = await generateResearchedArticle({ existingTitles, sourceContext: await institutionalContext(), market: settings.market,
          ...(candidate.kind === "IMPROVE_ARTICLE" && source ? { improvement: { title: String(source.title || ""), content: String(source.content || "") } } : {}) }, signal);
        if (isDuplicateEditorialTopic(generated.values.title, existingTitles)) throw new ContentError("الموضوع المقترح مكرر أو قريب جدًا من مقال موجود. أعد المحاولة لاقتراح موضوع آخر.");
        result = generated;
      }
      const fresh = candidate.sourceId ? await readContent(contentStore, "blog", candidate.sourceId) : null;
      const stale = fresh && (fingerprint(valuesFor("blog", fresh, "ar")) !== candidate.sourceRevision || fingerprint(valuesFor("blog", fresh, candidate.locale)) !== candidate.targetRevision);
      const status = stale ? "STALE" : "REVIEW";
      await prisma.editorialJob.updateMany({ where: { id: candidate.id, leaseToken, status: "RUNNING" }, data: { status, result: json(result), error: stale ? "تغير المحتوى أثناء التجهيز. أعد تجهيز المهمة." : null, leaseToken: null, leaseUntil: null, version: randomUUID() } });
      return { id: candidate.id, status };
    } catch (error) {
      const status = error instanceof ContentError && error.status === 409 ? "STALE" : "FAILED";
      const failure = suggestionFailure(error);
      const message = failure ? failure.reason + ": " + failure.error : error instanceof ContentError ? error.message : "تعذر تجهيز المسودة. راجع المهمة قبل إعادة المحاولة.";
      await prisma.editorialJob.updateMany({ where: { id: candidate.id, leaseToken, status: "RUNNING" }, data: { status, error: message.slice(0, 1000), leaseToken: null, leaseUntil: null, version: randomUUID() } });
      return { id: candidate.id, status };
    }
  }));
  } finally {
    await prisma.editorialSettings.updateMany({ where: { id: "plan", leaseToken: runnerToken }, data: { leaseToken: null, leaseUntil: null } });
  }
}
export async function applyEditorialJob(id: string, version: string, input: unknown) {
  return contentStore.transaction(async (tx) => {
    const job = await tx.model("editorialJob").findUnique({ where: { id } });
    if (!job) throw new ContentError("المهمة غير موجودة", 404);
    if (job.status === "APPLIED") return { contentId: String(job.resultContentId) };
    if (job.status !== "REVIEW" || job.version !== version) throw new ContentError("تغيرت المهمة. أعد تحميلها قبل الاعتماد.", 409);
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !EDITABLE.has(key))) throw new ContentError("حقول مراجعة غير صالحة");
    let contentId: string;
    if (job.kind === "ARTICLE") {
      const values = validateChanges(fieldsFor("blog", {}), input);
      const saved = await createWorkspace(tx, { kind: "blog", creationKey: String(job.creationKey), locale: "ar", changes: values, settings: { published: false } });
      contentId = saved.id;
    } else {
      contentId = String(job.sourceId);
      const row = await readContent(tx, "blog", contentId), locale = String(job.locale);
      if (fingerprint(valuesFor("blog", row, "ar")) !== job.sourceRevision || fingerprint(valuesFor("blog", row, locale)) !== job.targetRevision) throw new ContentError("تغير المصدر أو ترجمة هذه اللغة. احتفظ بالمراجعة وجهز مهمة جديدة.", 409);
      const values = validateChanges(fieldsFor("blog", row), input);
      if (job.kind === "IMPROVE_ARTICLE" && (!hasText(values.title) || !hasText(values.content))) throw new ContentError("أكمل عنوان المقال ومحتواه قبل الاعتماد");
      if (job.kind === "TRANSLATION") {
        const requested = Array.isArray(job.fields) ? job.fields : [];
        if (Object.keys(values).some((key) => !requested.includes(key)) || requested.some((key) => typeof key === "string" && !hasText(values[key]))) throw new ContentError("أكمل الحقول المطلوبة لهذه الترجمة فقط");
      }
      await saveWorkspace(tx, { kind: "blog", id: contentId, revision: fingerprint(row), locale, changes: values });
    }
    await tx.model("editorialJob").update({ where: { id, version }, data: { status: "APPLIED", resultContentId: contentId, result: { ...(job.result as ContentRecord || {}), values: input }, version: randomUUID() } });
    return { contentId };
  });
}
export async function changeEditorialJob(id: string, version: string, action: "retry" | "cancel") {
  const job = await prisma.editorialJob.findUnique({ where: { id } });
  if (!job || job.version !== version) throw new ContentError("تغيرت المهمة. أعد تحميل القائمة.", 409);
  if (action === "retry" && !["FAILED", "CANCELLED"].includes(job.status)) throw new ContentError("تُعاد محاولة المهام التي فشلت فقط");
  if (action === "cancel" && !["QUEUED", "RUNNING", "FAILED", "REVIEW"].includes(job.status)) throw new ContentError("لا يمكن إلغاء هذه المهمة");
  const result = await prisma.editorialJob.updateMany({ where: { id, version }, data: { status: action === "retry" ? "QUEUED" : "CANCELLED", error: null, leaseToken: null, leaseUntil: null, version: randomUUID() } });
  if (!result.count) throw new ContentError("تغيرت المهمة. أعد تحميل القائمة.", 409);
}

/** Requeue a bounded transient-only batch; request/configuration errors require individual review. */
export async function retryTransientEditorialJobs() {
  const settings = await editorialSettings();
  if (!settings.configured) throw new ContentError("خدمة بحث المحتوى غير مهيأة");
  const jobs = await prisma.editorialJob.findMany({ where: { status: "FAILED" }, orderBy: { updatedAt: "asc" }, take: 1001, select: { id: true, version: true, error: true, attempts: true, updatedAt: true } });
  if (jobs.length > 1000) throw new ContentError("عدد المهام كبير. راجع المهام وأعد المحاولات بشكل فردي.");
  const selection = selectEditorialRetries(jobs);
  let count = 0;
  for (const job of selection.selected) {
    const changed = await prisma.editorialJob.updateMany({ where: { id: job.id, version: job.version, status: "FAILED" }, data: { status: "QUEUED", error: null, leaseToken: null, leaseUntil: null, version: randomUUID() } });
    count += changed.count;
  }
  return { count, blocked: selection.blocked, deferred: selection.deferred, remaining: selection.remaining };
}
