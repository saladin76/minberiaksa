/** End-to-end provider smoke check using synthetic Arabic, with no content writes.
 * Default: no provider calls. Explicit: node --conditions=react-server --import tsx
 * scripts/audit-localized-content.mjs --check-generation --locales=en,tr,fr
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadReleaseModule } from "./release-metadata-runtime.mjs";

const title = "طرود غذائية للأسر في غزة";
const document = { type: "doc", content: [
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "هدف المشروع" }] },
  { type: "paragraph", content: [{ type: "text", text: "يوفر المشروع طرودًا غذائية للأسر المحتاجة في غزة. تكلفة الطرد 30 USD." }] },
  { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "توفير المواد الغذائية الأساسية مع الحفاظ على كرامة الأسر." }] }] }] },
] };
const shape = value => JSON.stringify(value, (key, field) => key === "text" ? "" : field);

/** Never print an arbitrary provider message, prompt, key or response body. */
export function localizedAuditFailure(error, { seoError, providerFailure }) {
  const provider = providerFailure(error);
  if (provider) return { reason: provider.reason, error: provider.error, ...(provider.details ? { details: provider.details } : {}) };
  if (error instanceof seoError) return { reason: error.reason || "SEO_GENERATION_FAILED", error: error.message, ...(error.validation ? { validation: error.validation } : {}) };
  if (error instanceof Error && ["TRANSLATION_CHECK_FAILED", "SEO_CHECK_FAILED"].includes(error.message)) return { reason: error.message };
  return { reason: "LOCALIZED_CONTENT_CHECK_FAILED" };
}

export async function probeLocalizedContent({ checkGeneration = false, locales = ["en", "tr", "fr"], translate, seo,
  describeFailure = error => { void error; return { reason: "LOCALIZED_CONTENT_CHECK_FAILED" }; }, onProgress = progress => { void progress; } }) {
  /** @type {Array<{locale: string, translation: string, seo: string, failure?: string, failureStage?: string, error?: string, details?: unknown, validation?: unknown}>} */
  const results = [];
  /** @type {{status:string,syntheticInputOnly:boolean,databaseWrites:number,recipientMessages:number,paymentCaptures:number,results:typeof results,homepageResults?:Array<{attempt:number,status:string,titleLength?:number,descriptionLength?:number,reason?:string}>}} */
  const report = { status: "generation_not_requested", syntheticInputOnly: true, databaseWrites: 0, recipientMessages: 0, paymentCaptures: 0, results };
  if (!checkGeneration) return report;
  for (const locale of locales) {
    const row = { locale, translation: locale === "ar" ? "source_language" : "not_checked", seo: "not_checked" };
    let stage = locale === "ar" ? "seo" : "translation";
    try {
      if (locale !== "ar") {
        row.translation = "checking"; onProgress({ locale, stage, status: "checking" });
        const translated = await translate({ fields: { title }, richFields: { description: JSON.stringify(document) }, sourceLocale: "ar" }, locale);
        if (!translated.fields.title?.trim() || !translated.richFields.description || translated.warnings.length || shape(JSON.parse(translated.richFields.description)) !== shape(document)) throw new Error("TRANSLATION_CHECK_FAILED");
        row.translation = "ready";
        onProgress({ locale, stage, status: "ready" });
      }
      stage = "seo"; row.seo = "checking"; onProgress({ locale, stage, status: "checking" });
      const result = await seo({ type: "campaign", locale, title, description: JSON.stringify(document) });
      if (!result.suggestion.seoTitle?.trim() || !result.suggestion.metaDescription?.trim() || !result.research.sources.length) throw new Error("SEO_CHECK_FAILED");
      row.seo = "ready";
      onProgress({ locale, stage, status: "ready" });
    } catch (error) {
      row[stage] = "failed";
      const failure = describeFailure(error);
      Object.assign(row, { failure: failure.reason, failureStage: stage },
        ...["error", "details", "validation"].filter(key => failure[key] !== undefined).map(key => ({ [key]: failure[key] })));
      onProgress({ locale, stage, status: "failed", reason: failure.reason });
    }
    report.results.push(row);
  }
  report.status = report.results.every(row => !row.failure) ? "generation_ready" : "generation_failed";
  return report;
}

/** Read-only reproduction of the real general-page English SEO path, repeated at most three times. */
export async function probeHomepageSeo({ checkGeneration = false, runs = 0, source = { title: "", description: "" }, seo, describeFailure = () => ({ reason: "LOCALIZED_CONTENT_CHECK_FAILED" }), onProgress = progress => { void progress; } }) {
  if (!checkGeneration || !runs) return [];
  if (!Number.isInteger(runs) || runs < 1 || runs > 3) throw new Error("INVALID_HOMEPAGE_RUNS");
  const results = [];
  for (let attempt = 1; attempt <= runs; attempt++) {
    onProgress({ phase: "homepage-seo-check", locale: "en", attempt, status: "checking" });
    try {
      const result = await seo({ ...source, type: "page", locale: "en" });
      if (!result.suggestion.seoTitle?.trim() || result.suggestion.seoTitle.length > 70 || !result.suggestion.metaDescription?.trim() || result.suggestion.metaDescription.length > 160 || !result.research.sources.length) throw new Error("SEO_CHECK_FAILED");
      results.push({ attempt, status: "ready", titleLength: result.suggestion.seoTitle.length, descriptionLength: result.suggestion.metaDescription.length });
    } catch (error) { results.push({ attempt, status: "failed", ...describeFailure(error) }); }
    onProgress({ phase: "homepage-seo-check", locale: "en", ...results[results.length - 1] });
  }
  return results;
}

async function main() {
  let prisma;
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== "--check-generation" && !arg.startsWith("--locales=") && !arg.startsWith("--homepage-runs=")) || args.filter(arg => arg.startsWith("--locales=")).length > 1 || args.filter(arg => arg.startsWith("--homepage-runs=")).length > 1) throw new Error("INVALID_OPTIONS");
    const requested = args.find(arg => arg.startsWith("--locales="))?.slice("--locales=".length).split(",") || ["en", "tr", "fr"];
    const { isValidLocale } = await loadReleaseModule("lib/locales.ts");
    if (!requested.length || requested.some(locale => !isValidLocale(locale)) || new Set(requested).size !== requested.length) throw new Error("INVALID_LOCALES");
    const checkGeneration = args.includes("--check-generation");
    const homepageRuns = Number(args.find(arg => arg.startsWith("--homepage-runs="))?.split("=")[1] || 0);
    if (!Number.isInteger(homepageRuns) || homepageRuns < 0 || homepageRuns > 3 || homepageRuns && !checkGeneration) throw new Error("INVALID_HOMEPAGE_RUNS");
    let translate, seo, describeFailure;
    if (checkGeneration) {
      const require = createRequire(resolve(process.cwd(), "package.json"));
      require("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
      ({ prisma } = await loadReleaseModule("lib/prisma.ts"));
      ({ translateItem: translate } = await loadReleaseModule("lib/content-localization/translate.ts"));
      const service = await loadReleaseModule("lib/content-editor/seo-research.ts"); seo = service.generateResearchedSeo;
      const { suggestionFailure } = await loadReleaseModule("lib/ai/core/suggestion-failure.ts");
      describeFailure = error => localizedAuditFailure(error, { seoError: service.SeoResearchError, providerFailure: suggestionFailure });
    }
    const report = await probeLocalizedContent({ checkGeneration, locales: requested, translate, seo, describeFailure,
      onProgress: progress => console.log(JSON.stringify({ phase: "localized-content-check", ...progress })),
    });
    if (homepageRuns) {
      report.syntheticInputOnly = false;
      const { pageSeoDefaults, readPageSeoDocument } = await loadReleaseModule("lib/content-editor/page-seo.ts");
      const { seoSourceText } = await loadReleaseModule("lib/content-editor/seo-source.ts");
      const source = pageSeoDefaults("home", "ar"), document = await readPageSeoDocument("home"), overrides = document.overrides.ar || {};
      report.homepageResults = await probeHomepageSeo({ checkGeneration, runs: homepageRuns, seo, describeFailure,
        source: { title: overrides.metaTitle || source.values.metaTitle, description: (overrides.metaDescription || source.values.metaDescription) + "\n" + seoSourceText(source.context) },
        onProgress: progress => console.log(JSON.stringify(progress)),
      });
      if (report.homepageResults.some(row => row.status !== "ready")) report.status = "generation_failed";
    }
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...report }, null, 2));
    if (checkGeneration && report.status !== "generation_ready") process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ status: "LOCALIZED_CONTENT_CHECK_UNAVAILABLE", databaseWrites: 0 })); process.exitCode = 1;
  } finally { await prisma?.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main();
