import type { SeoSuggestion } from "./seo-research";
import { protectedTokens } from "../content-localization/protected-tokens";

export function seoGroundingFields(copy: SeoSuggestion) {
  return [
    ...["seoTitle", "metaDescription", "primaryKeyword", "altText"].map(key => ({ key, text: copy[key as "seoTitle"] })),
    ...copy.keywords.map((text, index) => ({ key: `keywords.${index}`, text })),
    ...copy.longTailKeywords.map((text, index) => ({ key: `longTailKeywords.${index}`, text })),
    ...copy.faq.flatMap((item, index) => [{ key: `faq.${index}.question`, text: item.question }, { key: `faq.${index}.answer`, text: item.answer }]),
  ].filter(field => field.text.trim());
}
type Check = { key?: unknown; supported?: unknown; evidenceQuotes?: unknown };
const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
/** A reviewer verdict is insufficient without exact quotes from the Arabic master. */
export function groundedSeo(copy: SeoSuggestion, source: string, verdict: { checks?: unknown; relevantSourceUrls?: unknown }, sources: { url: string; title: string }[]) {
  const checks = Array.isArray(verdict.checks) ? verdict.checks as Check[] : [];
  const sourceText = normalized(source), tokens = new Set(protectedTokens(source));
  const supported = new Set<string>();
  for (const field of seoGroundingFields(copy)) {
    const matches = checks.filter(check => check.key === field.key);
    if (matches.length !== 1 || matches[0].supported !== true) continue;
    const quotes = matches[0].evidenceQuotes;
    if (!Array.isArray(quotes) || !quotes.length || !quotes.every(quote => typeof quote === "string" && normalized(quote).length >= 3 && sourceText.includes(normalized(quote)))) continue;
    if (protectedTokens(field.text).some(token => /^(?:num|cur|url|email):/.test(token) && !tokens.has(token))) continue;
    supported.add(field.key);
  }
  const unsafeRequired = ["seoTitle", "metaDescription"].filter(key => !supported.has(key));
  const approved = new Set(Array.isArray(verdict.relevantSourceUrls) ? verdict.relevantSourceUrls.filter((url): url is string => typeof url === "string") : []);
  const relevantSources = sources.filter(source => approved.has(source.url));
  const omitted = seoGroundingFields(copy).filter(field => !supported.has(field.key)).map(field => field.key);
  return { unsafeRequired, sources: relevantSources, omitted, suggestion: {
    ...copy,
    primaryKeyword: supported.has("primaryKeyword") ? copy.primaryKeyword : "",
    altText: supported.has("altText") ? copy.altText : "",
    keywords: copy.keywords.filter((_, i) => supported.has(`keywords.${i}`)),
    longTailKeywords: copy.longTailKeywords.filter((_, i) => supported.has(`longTailKeywords.${i}`)),
    faq: copy.faq.filter((_, i) => supported.has(`faq.${i}.question`) && supported.has(`faq.${i}.answer`)),
    // Researcher's commentary was not fact-checked and must not reintroduce blocked claims.
    notes: omitted.length ? ["حُجبت حقول اختيارية لا يسندها النص العربي؛ راجع المحتوى قبل الحفظ."] : [],
  } };
}
