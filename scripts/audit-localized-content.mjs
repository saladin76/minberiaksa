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

export async function probeLocalizedContent({ checkGeneration = false, locales = ["en", "tr", "fr"], translate, seo }) {
  /** @type {Array<{locale: string, translation: string, seo: string, failure?: string}>} */
  const results = [];
  const report = { status: "generation_not_requested", syntheticInputOnly: true, databaseWrites: 0, recipientMessages: 0, paymentCaptures: 0, results };
  if (!checkGeneration) return report;
  for (const locale of locales) {
    const row = { locale, translation: locale === "ar" ? "source_language" : "not_checked", seo: "not_checked" };
    try {
      if (locale !== "ar") {
        const translated = await translate({ fields: { title }, richFields: { description: JSON.stringify(document) }, sourceLocale: "ar" }, locale);
        if (!translated.fields.title?.trim() || !translated.richFields.description || translated.warnings.length || shape(JSON.parse(translated.richFields.description)) !== shape(document)) throw new Error("TRANSLATION_CHECK_FAILED");
        row.translation = "ready";
      }
      const result = await seo({ type: "campaign", locale, title, description: JSON.stringify(document) });
      if (!result.suggestion.seoTitle?.trim() || !result.suggestion.metaDescription?.trim() || !result.research.sources.length) throw new Error("SEO_CHECK_FAILED");
      row.seo = "ready";
    } catch { row.failure = "LOCALIZED_CONTENT_CHECK_FAILED"; }
    report.results.push(row);
  }
  report.status = report.results.every(row => !row.failure) ? "generation_ready" : "generation_failed";
  return report;
}

async function main() {
  let prisma;
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== "--check-generation" && !arg.startsWith("--locales=")) || args.filter(arg => arg.startsWith("--locales=")).length > 1) throw new Error("INVALID_OPTIONS");
    const requested = args.find(arg => arg.startsWith("--locales="))?.slice("--locales=".length).split(",") || ["en", "tr", "fr"];
    const { isValidLocale } = await loadReleaseModule("lib/locales.ts");
    if (!requested.length || requested.some(locale => !isValidLocale(locale)) || new Set(requested).size !== requested.length) throw new Error("INVALID_LOCALES");
    const checkGeneration = args.includes("--check-generation");
    let translate, seo;
    if (checkGeneration) {
      const require = createRequire(resolve(process.cwd(), "package.json"));
      require("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
      ({ prisma } = await loadReleaseModule("lib/prisma.ts"));
      ({ translateItem: translate } = await loadReleaseModule("lib/content-localization/translate.ts"));
      ({ generateResearchedSeo: seo } = await loadReleaseModule("lib/content-editor/seo-research.ts"));
    }
    const report = await probeLocalizedContent({ checkGeneration, locales: requested, translate, seo });
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...report }, null, 2));
    if (checkGeneration && report.status !== "generation_ready") process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ status: "LOCALIZED_CONTENT_CHECK_UNAVAILABLE", databaseWrites: 0 })); process.exitCode = 1;
  } finally { await prisma?.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main();
