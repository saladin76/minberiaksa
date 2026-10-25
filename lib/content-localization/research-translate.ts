import "server-only";
import { generateResearchedSeo } from "../content-editor/seo-research";
import { translateItem } from "./translate";
export async function translateResearchedItem(
  input: Parameters<typeof translateItem>[0], locale: string, signal?: AbortSignal, market?: string,
) {
  signal?.throwIfAborted();
  const fields = { ...input.fields, ...input.richFields };
  const title = fields.title || fields.name || fields.question || input.itemLabel || "Minbar Al-Aqsa";
  const context = Object.values(fields).filter(Boolean).join("\n");
  const researched = await generateResearchedSeo({ type: "page", locale, title, description: context, market }, signal);
  if (!researched.research.sources.length) throw new Error("لم تتوفر مصادر لبحث الترجمة");
  const researchContext = JSON.stringify({
    language: locale, market: researched.research.market,
    terminology: [...researched.suggestion.keywords, ...researched.suggestion.longTailKeywords],
    guidance: researched.suggestion.notes, searchIntent: researched.research.summary,
  }).slice(0, 6000);
  const translation = await translateItem({ ...input, signal, researchContext }, locale);
  return { translation, research: researched.research };
}
