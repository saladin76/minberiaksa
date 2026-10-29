import { DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "../locales";

/** Pure project/line projection shared by all template context loaders. */
type DonationLine = { amount: number; amountUSD: number | null; shareCount?: number | null };
type CampaignName = { title: string; translations?: ReadonlyArray<{ locale: string; title: string | null }> };
type CategoryName = { name: string; translations?: ReadonlyArray<{ locale: string; name: string | null }> };
export type DonationProjectSource = {
  locale?: string | null;
  items: Array<DonationLine & { campaign: CampaignName | null }>;
  categoryItems?: Array<DonationLine & { category: CategoryName | null }>;
  waqfItems?: Array<DonationLine & { unit: string; count: number }>;
};

function normalizedLocale(value?: string | null): string {
  const key = (value || "").trim().toLowerCase().split(/[-_]/)[0];
  return key === "nb" ? "no" : key;
}

/** The checkout language wins over an older account preference. No locale is inferred from currency. */
export function donationMessageLocale(...candidates: Array<string | null | undefined>): SupportedLocale {
  for (const value of candidates) {
    const locale = normalizedLocale(value);
    if (isValidLocale(locale)) return locale;
  }
  return DEFAULT_LOCALE;
}

// A missing translation must not insert the Arabic canonical name into a foreign-language receipt.
const PROJECT_LABELS: Record<SupportedLocale, { project: string; category: string }> = {
  ar: { project: "مشروع التبرع", category: "تصنيف التبرع" },
  tr: { project: "Bağış projesi", category: "Bağış kategorisi" },
  en: { project: "Donation project", category: "Donation category" },
  fr: { project: "Projet de don", category: "Catégorie de don" },
  de: { project: "Spendenprojekt", category: "Spendenkategorie" },
  es: { project: "Proyecto de donación", category: "Categoría de donación" },
  id: { project: "Proyek donasi", category: "Kategori donasi" },
  pt: { project: "Projeto de doação", category: "Categoria de doação" },
  ur: { project: "عطیے کا منصوبہ", category: "عطیے کا زمرہ" },
  sq: { project: "Projekt dhurimi", category: "Kategori dhurimi" },
  it: { project: "Progetto di donazione", category: "Categoria di donazione" },
  nl: { project: "Donatieproject", category: "Donatiecategorie" },
  sv: { project: "Donationsprojekt", category: "Donationskategori" },
  no: { project: "Donasjonsprosjekt", category: "Donasjonskategori" },
  da: { project: "Donationsprojekt", category: "Donationskategori" },
  ms: { project: "Projek sumbangan", category: "Kategori sumbangan" },
  ja: { project: "寄付プロジェクト", category: "寄付カテゴリー" },
  zh: { project: "捐赠项目", category: "捐赠类别" },
  hi: { project: "दान परियोजना", category: "दान श्रेणी" },
};

export function donationCampaignTitle(campaign: CampaignName, requestedLocale?: string | null): string {
  const locale = donationMessageLocale(requestedLocale);
  return (locale === "ar" ? campaign.title : campaign.translations?.find((t) => normalizedLocale(t.locale) === locale)?.title)?.trim()
    || PROJECT_LABELS[locale].project;
}

function donationCategoryTitle(category: CategoryName, locale: SupportedLocale): string {
  return (locale === "ar" ? category.name : category.translations?.find((t) => normalizedLocale(t.locale) === locale)?.name)?.trim()
    || PROJECT_LABELS[locale].category;
}

// Generic labels describe the actual line kind; never invent a campaign for missing legacy data.
const LABELS: Record<string, { general: string; share: string; meter: string }> = {
  ar: { general: "تبرع عام", share: "سهم وقفي", meter: "متر وقفي" },
  tr: { general: "Genel bağış", share: "Vakıf hissesi", meter: "Vakıf metre bağışı" },
  en: { general: "General donation", share: "Waqf share", meter: "Waqf metre" },
  fr: { general: "Don général", share: "Part de waqf", meter: "Mètre de waqf" },
  de: { general: "Allgemeine Spende", share: "Waqf-Anteil", meter: "Waqf-Meter" },
  es: { general: "Donación general", share: "Participación de waqf", meter: "Metro de waqf" },
  id: { general: "Donasi umum", share: "Saham wakaf", meter: "Meter wakaf" },
  pt: { general: "Doação geral", share: "Quota de waqf", meter: "Metro de waqf" },
  ur: { general: "عمومی عطیہ", share: "وقف کا حصہ", meter: "وقف کا میٹر" },
  sq: { general: "Dhurim i përgjithshëm", share: "Pjesë vakëfi", meter: "Metër vakëfi" },
  it: { general: "Donazione generale", share: "Quota waqf", meter: "Metro waqf" },
  nl: { general: "Algemene donatie", share: "Waqf-aandeel", meter: "Waqf-meter" },
  sv: { general: "Allmän donation", share: "Waqf-andel", meter: "Waqf-meter" },
  no: { general: "Generell donasjon", share: "Waqf-andel", meter: "Waqf-meter" },
  da: { general: "Generel donation", share: "Waqf-andel", meter: "Waqf-meter" },
  ms: { general: "Sumbangan umum", share: "Saham wakaf", meter: "Meter wakaf" },
  ja: { general: "一般寄付", share: "ワクフ持分", meter: "ワクフ区画（メートル）" },
  zh: { general: "一般捐赠", share: "瓦克夫份额", meter: "瓦克夫米份额" },
  hi: { general: "सामान्य दान", share: "वक्फ़ हिस्सा", meter: "वक्फ़ मीटर" },
};

export function donationProjectSummary(donation: DonationProjectSource): {
  campaignTitle: string;
  lines: Array<DonationLine & { campaignTitle: string }>;
} {
  const locale = donationMessageLocale(donation.locale);
  const labels = LABELS[locale];
  const lines = [
    ...donation.items.map((item) => ({
      amount: item.amount, amountUSD: item.amountUSD, shareCount: item.shareCount,
      campaignTitle: item.campaign ? donationCampaignTitle(item.campaign, locale) : labels.general,
    })),
    ...(donation.categoryItems ?? []).map((item) => ({
      amount: item.amount, amountUSD: item.amountUSD, shareCount: null,
      campaignTitle: item.category ? donationCategoryTitle(item.category, locale) : labels.general,
    })),
    ...(donation.waqfItems ?? []).map((item) => ({
      amount: item.amount, amountUSD: item.amountUSD, shareCount: item.count,
      campaignTitle: item.unit === "METER" ? labels.meter : labels.share,
    })),
  ];
  return {
    campaignTitle: lines.map((line) => line.campaignTitle).join(locale === "ar" || locale === "ur" ? "، " : ", ") || labels.general,
    lines,
  };
}

const DONOR_LABELS:Record<string,string>={ar:"الداعم الكريم",tr:"Bağışçımız",en:"Supporter",fr:"cher donateur",de:"liebe Unterstützerin, lieber Unterstützer",es:"donante",id:"Donatur",pt:"doador",ur:"معزز عطیہ دہندہ",sq:"donator",it:"donatore",nl:"donateur",sv:"givare",no:"giver",da:"donor",ms:"Penderma",ja:"ご支援者様",zh:"爱心捐赠者",hi:"प्रिय दानदाता"};
/** A neutral salutation is not a fabricated personal name. Never persist it on the user. */
export function templateDonorName(name:string|null|undefined,locale?:string|null):string{
 const key=String(locale || "ar").toLowerCase().split(/[-_]/)[0];return name?.trim() || DONOR_LABELS[key==="nb"?"no":key] || DONOR_LABELS.ar;
}
