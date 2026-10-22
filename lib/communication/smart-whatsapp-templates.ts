import { resolveTemplateKind } from "./template-kind";
import { resolveVariantForLocale, type VariantRow } from "./whatsapp-template-readiness";

type Purpose = "UTILITY" | "MARKETING";
type Template = {
  id: string;
  name: string;
  kind?: string | null;
  purpose?: string | null;
  category?: string | null;
  wabaVariants: Array<VariantRow & { businessAccountId: string }>;
};
type Choice = { id: string; name: string; category: string | null };

/** Match the send path: routed WABA, locale fallback, approval, then Meta's actual category. */
export function smartWhatsappTemplateChoices(
  templates: Template[],
  locale: string,
  wabas: Record<Purpose, string | null>,
): { utilityTemplates: Choice[]; marketingTemplates: Choice[] } {
  const result: { utilityTemplates: Choice[]; marketingTemplates: Choice[] } = {
    utilityTemplates: [], marketingTemplates: [],
  };
  for (const purpose of ["UTILITY", "MARKETING"] as const) {
    const waba = wabas[purpose];
    if (!waba) continue;
    for (const template of templates) {
      if (resolveTemplateKind(template) !== (purpose === "MARKETING" ? "CAMPAIGN" : "SYSTEM")) continue;
      const readiness = resolveVariantForLocale(
        template.wabaVariants.filter((variant) => variant.businessAccountId === waba), locale,
      );
      if (!readiness.ready || readiness.category?.toUpperCase() !== purpose) continue;
      const choices = purpose === "UTILITY" ? result.utilityTemplates : result.marketingTemplates;
      choices.push({ id: template.id, name: template.name, category: readiness.category });
    }
  }
  return result;
}
