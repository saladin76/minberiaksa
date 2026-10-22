/** Canonical usage classification, independent of locale; never mutates provider categories. */
export type TemplateKind = "SYSTEM" | "CAMPAIGN";
export function resolveTemplateKind(template: {
  kind?: string | null;
  purpose?: string | null;
  category?: string | null;
}, linkedToEvent = false): TemplateKind {
  if (linkedToEvent || template.kind === "SYSTEM") return "SYSTEM";
  const purpose = String(template.purpose ?? template.category ?? "").toUpperCase();
  return ["UTILITY", "TRANSACTIONAL", "AUTHENTICATION"].includes(purpose) ? "SYSTEM" : "CAMPAIGN";
}
