import { hasUnexpectedArabicProse } from "./translation-language";
import { hasSameTextStructure } from "./translation-structure";
import { missingProtectedTokens } from "./protected-tokens";

/** Pure, read-only QA for already stored locale variants. */
export type LocalizationQualityCode = "SOURCE_LEAK" | "PROTECTED_VALUE_CHANGED" | "STRUCTURE_CHANGED" | "DUPLICATE_LOCALE";
export type LocalizationQualityIssue = { code: LocalizationQualityCode; field: string; message: string };

type TextNode = { type?: unknown; text?: unknown; content?: unknown; [key: string]: unknown };
function parseDocument(value: string): TextNode | null {
  if (!value.trim().startsWith("{")) return null;
  try {
    const candidate: unknown = JSON.parse(value);
    if (candidate && typeof candidate === "object" && (candidate as TextNode).type === "doc")
      return candidate as TextNode;
  } catch { /* Not a Tiptap document. */ }
  return null;
}
function textNodes(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  const current = node as TextNode;
  return [
    ...(typeof current.text === "string" ? [current.text] : []),
    ...(Array.isArray(current.content) ? current.content.flatMap(textNodes) : []),
  ];
}
function shapeWithoutText(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(shapeWithoutText);
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(Object.entries(node).map(([key, value]) =>
    [key, key === "text" && typeof value === "string" ? "" : shapeWithoutText(value)]));
}

/**
 * Draft QA, not a semantic equivalence score. Human review is still mandatory.
 * Inspect visible prose rather than JSON attributes (image alt, href, mark names).
 */
export function localizationQualityIssues(
  field: string, source: string, translated: string, locale: string,
): LocalizationQualityIssue[] {
  if (!source.trim() || !translated.trim()) return [];
  const issues: LocalizationQualityIssue[] = [];
  const sourceDoc = parseDocument(source);
  const translatedDoc = parseDocument(translated);
  let sourceText = source;
  let targetText = translated;

  if (sourceDoc || translatedDoc) {
    if (!sourceDoc || !translatedDoc ||
      JSON.stringify(shapeWithoutText(sourceDoc)) !== JSON.stringify(shapeWithoutText(translatedDoc))) {
      issues.push({ field, code: "STRUCTURE_CHANGED", message: "تغيّرت بنية المستند المنسق." });
    }
    sourceText = sourceDoc ? textNodes(sourceDoc).join("\n") : source;
    targetText = translatedDoc ? textNodes(translatedDoc).join("\n") : translated;
  } else if (!hasSameTextStructure(source, translated)) {
    issues.push({ field, code: "STRUCTURE_CHANGED", message: "تغيّر تنسيق السطور أو HTML." });
  }

  const missing = missingProtectedTokens(sourceText, targetText);
  if (missing.length)
    issues.push({ field, code: "PROTECTED_VALUE_CHANGED", message: `قيم محمية مفقودة أو متغيرة: ${missing.slice(0, 3).join(", ")}` });

  if (locale !== "ar" && locale !== "ur" && hasUnexpectedArabicProse(sourceText, targetText))
    issues.push({ field, code: "SOURCE_LEAK", message: "بقي نص عربي غير مترجم في هذه اللغة." });

  return issues;
}
