// Repair only an exact previous managed seed, never submitted or operator-edited content.
const CONTENT_FIELDS = ["body", "translations", "header", "footerText", "buttons", "authentication", "category", "purpose", "kind"];
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)])) : value ?? null;
const normalized = (row, key) => key === "buttons" ? row[key] ?? [] : key === "header" ? row[key] ?? { type: "NONE" }
  : key === "authentication" ? row[key] ?? {} : key === "footerText" ? row[key] ?? "" : row[key] ?? null;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
export const sameManagedWhatsappDraft = (row, draft) => CONTENT_FIELDS.every(key => same(normalized(row, key), normalized(draft, key)));
const localeOf = row => {
  const locale = String(row.locale || row.languageCode || "").toLowerCase().split(/[_-]/)[0];
  return locale === "nb" ? "no" : locale;
};

export async function ensureManagedWhatsappDraft(prisma, { draft, previousDraft, mutableLocales }) {
  return prisma.$transaction(async tx => {
    const matches = await tx.whatsappTemplate.findMany({ where: { name: draft.name }, take: 2 });
    if (matches.length > 1) throw new Error("MANAGED_TEMPLATE_NAME_AMBIGUOUS");
    const current = matches[0];
    if (!current) return { template: await tx.whatsappTemplate.create({ data: { ...draft, status: "DRAFT" } }), created: true, repairedLocales: [] };
    if (current.status === "ARCHIVED") throw new Error("MANAGED_TEMPLATE_ARCHIVED");
    if (sameManagedWhatsappDraft(current, draft)) return { template: current, created: false, repairedLocales: [] };
    if (!previousDraft || !sameManagedWhatsappDraft(current, previousDraft)) throw new Error("MANAGED_TEMPLATE_EDITORIAL_CHANGES_REQUIRE_REVIEW");
    const before = current.translations ?? {}, after = draft.translations ?? {};
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(locale => !same(before[locale], after[locale]));
    if (changed.some(locale => !mutableLocales.includes(locale))) throw new Error("MANAGED_TEMPLATE_LOCALE_REPAIR_NOT_ALLOWED");
    // Do not swallow either read failure: missing provider evidence is not permission to edit.
    const [exact, aggregate] = await Promise.all([
      tx.whatsappTemplateWabaVariant.findMany({ where: { templateId: current.id, provider: "META_WHATSAPP" }, select: { languageCode: true, locale: true, providerTemplateId: true, approvalStatus: true } }),
      tx.whatsappTemplateVariant.findMany({ where: { templateId: current.id, provider: "META_WHATSAPP" }, select: { languageCode: true, locale: true, providerTemplateId: true, approvalStatus: true } }),
    ]);
    const submitted = [...exact, ...aggregate].filter(row => Boolean(row.providerTemplateId) || ["APPROVED", "PENDING"].includes(row.approvalStatus));
    const rootChanged = CONTENT_FIELDS.filter(key => key !== "translations").some(key => !same(normalized(current, key), normalized(draft, key)));
    if (rootChanged && (current.externalTemplateId || submitted.length) || submitted.some(row => !localeOf(row) || changed.includes(localeOf(row)))) throw new Error("MANAGED_TEMPLATE_SUBMITTED_CONTENT_IS_IMMUTABLE");
    const patch = Object.fromEntries(CONTENT_FIELDS.filter(key => Object.hasOwn(draft, key)).map(key => [key, draft[key]]));
    const result = await tx.whatsappTemplate.updateMany({ where: { id: current.id, updatedAt: current.updatedAt, status: { not: "ARCHIVED" } }, data: patch });
    if (result.count !== 1) throw new Error("MANAGED_TEMPLATE_CONCURRENT_CHANGE");
    return { template: { ...current, ...patch }, created: false, repairedLocales: changed };
  });
}
