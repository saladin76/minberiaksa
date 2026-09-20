/**
 * The wording on the three documents, and where each line comes from.
 *
 * `CERTIFICATES_DOWNLOADS_HANDOFF.md §4`: "All body copy is dashboard-editable
 * per template and per locale — store it, don't hardcode." So every line a
 * document prints is a named field here. Its default is the i18n text (19
 * locales, `certificates` namespace) and the dashboard may override any field
 * for any locale; `lib/certificates/copy.ts` merges the two.
 *
 * Two kinds of line are deliberately NOT fields: the Qur'anic verses, which
 * come from the `quran` namespace (`RELIGIOUS_LOCKED` — no override, no
 * retranslation), and the foundation's legal registration data on the receipt
 * (`orgLegalName`, `taxNo`, `orgAddress`, `orgContact`), which the receipt
 * template says stays in Latin script exactly as the Turkish register has it,
 * in every language. Those four are editable but not per locale.
 *
 * This module is pure so the dashboard form can import the field lists.
 */

export type CertificateTemplateId = "thanks" | "waqf" | "receipt";

export interface ThanksCopy {
  title: string;
  nameLabel: string;
  body: string;
  duaText: string;
  motto: string;
  orgName: string;
}

export interface WaqfCopy {
  certNoLabel: string;
  countShares: string;
  countMeters: string;
  certifiesThat: string;
  endowedShares: string;
  endowedMeters: string;
  valueLabel: string;
  onBehalfLabel: string;
  dateLabel: string;
  directorLabel: string;
  legalText: string;
  aboutText: string;
  /** Non-Arabic editions set the title as text: eyebrow + unit title. */
  certWord: string;
  shareUnitTitle: string;
  meterUnitTitle: string;
  /** Alt text for the Arabic title artwork. */
  certTitleShare: string;
  certTitleMeter: string;
}

export interface ReceiptCopy {
  docTitle: string;
  docTitleLatin: string;
  taxLabel: string;
  receiptNoLabel: string;
  dateLabel: string;
  methodLabel: string;
  statusLabel: string;
  statusPaid: string;
  donorLabel: string;
  donorRefLabel: string;
  emptyTitle: string;
  emptyHint: string;
  colItem: string;
  colType: string;
  colAmount: string;
  kindDonation: string;
  totalLabel: string;
  wordsLabel: string;
  signatureLabel: string;
  accountantLabel: string;
  orgName: string;
  verifyLabel: string;
  legalNote: string;
  /** Printed on the donor-language copy: "valid together with the Turkish copy". */
  pairNote: string;
}

/** The registration data every receipt carries, Latin script, not per locale. */
export interface ReceiptOrgData {
  orgLegalName: string;
  taxNo: string;
  orgAddress: string;
  orgContact: string;
}

export const RECEIPT_ORG_DEFAULTS: ReceiptOrgData = {
  orgLegalName: "Uluslararası Minber-i Aksâ Derneği",
  taxNo: "8900363807",
  orgAddress: "Haseki Sultan Mah. Turgut Özal Millet Cad. No:55 Daire:4 Fatih/İstanbul",
  orgContact: "info@minberiaksa.org",
};

/** The shape stored in `GlobalSettings.certificateCopy`. */
export interface CertificateCopyOverrides {
  thanks?: Record<string, Partial<ThanksCopy>>;
  waqf?: Record<string, Partial<WaqfCopy>>;
  receipt?: Record<string, Partial<ReceiptCopy>>;
  receiptOrg?: Partial<ReceiptOrgData>;
}

/**
 * Each editable field, with the i18n key it defaults to and a dashboard label.
 * Order is the order the dashboard shows them.
 */
export const THANKS_FIELDS: ReadonlyArray<{ name: keyof ThanksCopy; i18nKey: string; label: string; multiline?: boolean }> = [
  { name: "title", i18nKey: "thanksTitle", label: "عنوان الشهادة" },
  { name: "nameLabel", i18nKey: "nameLabel", label: "عبارة تقديم الاسم" },
  { name: "body", i18nKey: "thanksBody", label: "نص الشهادة", multiline: true },
  { name: "duaText", i18nKey: "duaText", label: "الدعاء الختامي", multiline: true },
  { name: "motto", i18nKey: "motto", label: "الشعار" },
  { name: "orgName", i18nKey: "orgName", label: "اسم المؤسسة" },
];

export const WAQF_FIELDS: ReadonlyArray<{ name: keyof WaqfCopy; i18nKey: string; label: string; multiline?: boolean }> = [
  { name: "certifiesThat", i18nKey: "certifiesThat", label: "عبارة الإشهاد" },
  { name: "endowedShares", i18nKey: "endowedShares", label: "سطر الأسهم" },
  { name: "endowedMeters", i18nKey: "endowedMeters", label: "سطر الأمتار" },
  { name: "legalText", i18nKey: "waqfLegalText", label: "نص الإقرار الشرعي", multiline: true },
  { name: "aboutText", i18nKey: "aboutFoundation", label: "التعريف بالمؤسسة (الوجه الخلفي)", multiline: true },
  { name: "certNoLabel", i18nKey: "certNoLabel", label: "تسمية رقم الشهادة" },
  { name: "countShares", i18nKey: "countShares", label: "تسمية عدد الأسهم" },
  { name: "countMeters", i18nKey: "countMeters", label: "تسمية عدد الأمتار" },
  { name: "valueLabel", i18nKey: "valueLabel", label: "تسمية القيمة" },
  { name: "onBehalfLabel", i18nKey: "onBehalfLabel", label: "تسمية «أوقفها عن»" },
  { name: "dateLabel", i18nKey: "dateLabel", label: "تسمية التاريخ" },
  { name: "directorLabel", i18nKey: "directorLabel", label: "تسمية التوقيع" },
  { name: "certWord", i18nKey: "certWord", label: "كلمة «شهادة» (النسخ غير العربية)" },
  { name: "shareUnitTitle", i18nKey: "shareUnitTitle", label: "عنوان السهم (النسخ غير العربية)" },
  { name: "meterUnitTitle", i18nKey: "meterUnitTitle", label: "عنوان المتر (النسخ غير العربية)" },
  { name: "certTitleShare", i18nKey: "certTitleShare", label: "الوصف البديل لعنوان السهم" },
  { name: "certTitleMeter", i18nKey: "certTitleMeter", label: "الوصف البديل لعنوان المتر" },
];

export const RECEIPT_FIELDS: ReadonlyArray<{ name: keyof ReceiptCopy; i18nKey: string | null; label: string; multiline?: boolean }> = [
  { name: "docTitle", i18nKey: "rcpDocTitle", label: "عنوان المستند" },
  { name: "docTitleLatin", i18nKey: null, label: "العنوان اللاتيني" },
  { name: "legalNote", i18nKey: "rcpLegalNote", label: "الملاحظة القانونية", multiline: true },
  { name: "pairNote", i18nKey: null, label: "ملاحظة النسخة التركية المرافقة" },
  { name: "signatureLabel", i18nKey: "directorLabel", label: "تسمية التوقيع" },
  { name: "accountantLabel", i18nKey: "rcpAccountantLabel", label: "تسمية المحاسب" },
  { name: "orgName", i18nKey: "orgName", label: "اسم المؤسسة" },
  { name: "taxLabel", i18nKey: "rcpTaxLabel", label: "تسمية الرقم الضريبي" },
  { name: "receiptNoLabel", i18nKey: "rcpNoLabel", label: "تسمية رقم الإيصال" },
  { name: "dateLabel", i18nKey: "rcpDateLabel", label: "تسمية تاريخ الإصدار" },
  { name: "methodLabel", i18nKey: "rcpMethodLabel", label: "تسمية طريقة الدفع" },
  { name: "statusLabel", i18nKey: "rcpStatusLabel", label: "تسمية حالة العملية" },
  { name: "statusPaid", i18nKey: "rcpStatusPaid", label: "حالة «مدفوع»" },
  { name: "donorLabel", i18nKey: "rcpDonorLabel", label: "تسمية المتبرع" },
  { name: "donorRefLabel", i18nKey: "rcpDonorRefLabel", label: "تسمية بيانات التواصل" },
  { name: "colItem", i18nKey: "rcpColItem", label: "عمود البند" },
  { name: "colType", i18nKey: "rcpColType", label: "عمود النوع" },
  { name: "colAmount", i18nKey: "rcpColAmount", label: "عمود المبلغ" },
  { name: "kindDonation", i18nKey: "rcpKindDonation", label: "نوع البند الافتراضي" },
  { name: "totalLabel", i18nKey: "rcpTotalLabel", label: "تسمية الإجمالي" },
  { name: "wordsLabel", i18nKey: "rcpWordsLabel", label: "كلمة «فقط» قبل المبلغ كتابةً" },
  { name: "verifyLabel", i18nKey: "rcpVerifyLabel", label: "تسمية رمز التحقق" },
  { name: "emptyTitle", i18nKey: "rcpEmptyTitle", label: "عنوان الإيصال الخالي" },
  { name: "emptyHint", i18nKey: "rcpEmptyHint", label: "توضيح الإيصال الخالي" },
];

/** Defaults with no i18n key — the template's own literal values. */
export const RECEIPT_LITERAL_DEFAULTS: Pick<ReceiptCopy, "docTitleLatin" | "pairNote"> = {
  docTitleLatin: "Bağış Makbuzu / Donation Receipt",
  pairNote: "Bu makbuz Türkçe nüshası ile birlikte geçerlidir.",
};

/**
 * Build a template's copy for one locale from the i18n namespace plus the
 * stored overrides. `messages` is the locale's `certificates` namespace.
 */
export function resolveThanksCopy(messages: Record<string, unknown>, overrides?: Partial<ThanksCopy>): ThanksCopy {
  const out = {} as ThanksCopy;
  for (const field of THANKS_FIELDS) {
    const override = overrides?.[field.name];
    out[field.name] = typeof override === "string" && override.trim() ? override : String(messages[field.i18nKey] ?? "");
  }
  return out;
}

export function resolveWaqfCopy(messages: Record<string, unknown>, overrides?: Partial<WaqfCopy>): WaqfCopy {
  const out = {} as WaqfCopy;
  for (const field of WAQF_FIELDS) {
    const override = overrides?.[field.name];
    out[field.name] = typeof override === "string" && override.trim() ? override : String(messages[field.i18nKey] ?? "");
  }
  return out;
}

export function resolveReceiptCopy(messages: Record<string, unknown>, overrides?: Partial<ReceiptCopy>): ReceiptCopy {
  const out = {} as ReceiptCopy;
  for (const field of RECEIPT_FIELDS) {
    const override = overrides?.[field.name];
    if (typeof override === "string" && override.trim()) {
      out[field.name] = override;
      continue;
    }
    if (field.i18nKey) out[field.name] = String(messages[field.i18nKey] ?? "");
    else out[field.name] = RECEIPT_LITERAL_DEFAULTS[field.name as keyof typeof RECEIPT_LITERAL_DEFAULTS] ?? "";
  }
  return out;
}

export function resolveReceiptOrg(overrides?: Partial<ReceiptOrgData>): ReceiptOrgData {
  const out = { ...RECEIPT_ORG_DEFAULTS };
  for (const key of Object.keys(out) as (keyof ReceiptOrgData)[]) {
    const override = overrides?.[key];
    if (typeof override === "string" && override.trim()) out[key] = override;
  }
  return out;
}

/** Keep only strings, only for known fields — the shape the API stores. */
export function sanitizeCopyOverrides(input: unknown): CertificateCopyOverrides {
  const out: CertificateCopyOverrides = {};
  if (!input || typeof input !== "object") return out;
  const raw = input as Record<string, unknown>;

  const pickLocales = <T extends string>(section: unknown, fields: readonly T[]): Record<string, Partial<Record<T, string>>> | undefined => {
    if (!section || typeof section !== "object") return undefined;
    const result: Record<string, Partial<Record<T, string>>> = {};
    for (const [locale, values] of Object.entries(section as Record<string, unknown>)) {
      if (!values || typeof values !== "object" || !/^[a-z]{2}$/.test(locale)) continue;
      const row: Partial<Record<T, string>> = {};
      for (const field of fields) {
        const value = (values as Record<string, unknown>)[field];
        if (typeof value === "string" && value.trim()) row[field] = value.trim();
      }
      if (Object.keys(row).length) result[locale] = row;
    }
    return Object.keys(result).length ? result : undefined;
  };

  const thanks = pickLocales(raw.thanks, THANKS_FIELDS.map((f) => f.name));
  const waqf = pickLocales(raw.waqf, WAQF_FIELDS.map((f) => f.name));
  const receipt = pickLocales(raw.receipt, RECEIPT_FIELDS.map((f) => f.name));
  if (thanks) out.thanks = thanks;
  if (waqf) out.waqf = waqf;
  if (receipt) out.receipt = receipt;

  if (raw.receiptOrg && typeof raw.receiptOrg === "object") {
    const org: Partial<ReceiptOrgData> = {};
    for (const key of Object.keys(RECEIPT_ORG_DEFAULTS) as (keyof ReceiptOrgData)[]) {
      const value = (raw.receiptOrg as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) org[key] = value.trim();
    }
    if (Object.keys(org).length) out.receiptOrg = org;
  }
  return out;
}
