import { deriveOverallMetaTemplateStatus } from "./whatsapp-template-status";

type LanguageHint = { languageCode: string; locale: string | null };
type ExactVariant = LanguageHint & {
  businessAccountId: string; approvalStatus: string; category: string | null;
  rejectionReason: string | null; qualityRating: string | null; lastSyncedAt: Date;
};

/** Absence on another account is irrelevant. Absence on the configured default
 * must remain visible; a label never manufactures provider approval. */
export function defaultTemplateStatus(defaultWaba: string | null, exact: ExactVariant[], hints: LanguageHint[]) {
  const own = defaultWaba ? exact.filter(row => row.businessAccountId === defaultWaba) : [];
  const key = (row: LanguageHint) => (row.locale || row.languageCode).toLowerCase().split(/[-_]/)[0].replace(/^nb$/, "no");
  const seen = new Set(own.map(key));
  const variants = own.map(row => ({ languageCode: row.languageCode, locale: row.locale,
    approvalStatus: row.approvalStatus, category: row.category, rejectionReason: row.rejectionReason,
    qualityRating: row.qualityRating, lastSyncedAt: row.lastSyncedAt,
    providerCategories: row.category ? [row.category] : [] }));
  for (const hint of hints) {
    if (seen.has(key(hint))) continue;
    seen.add(key(hint));
    variants.push({ ...hint, approvalStatus: defaultWaba ? "MISSING_IN_WABA" : "UNKNOWN", category: null, rejectionReason: null, qualityRating: null, lastSyncedAt: new Date(0), providerCategories: [] });
  }
  const overall = deriveOverallMetaTemplateStatus(variants.map(row => row.approvalStatus));
  return {
    variants,
    overall,
    labelAr: !defaultWaba ? "لم يُضبط حساب واتساب الافتراضي" : overall.internalStatus === "APPROVED" ? "معتمد في الحساب الافتراضي" : overall.internalStatus === "MISSING_IN_WABA" ? "غير متاح في الحساب الافتراضي" : overall.labelAr,
  };
}
