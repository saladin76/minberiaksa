/** Pure project/line projection shared by all template context loaders. */
type DonationLine = { amount: number; amountUSD: number | null; shareCount?: number | null };
export type DonationProjectSource = {
  locale?: string | null;
  items: Array<DonationLine & { campaign: { title: string } | null }>;
  categoryItems?: Array<DonationLine & { category: { name: string } | null }>;
  waqfItems?: Array<DonationLine & { unit: string; count: number }>;
};

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
  const locale = (donation.locale || "ar").trim().toLowerCase().split(/[-_]/)[0];
  const labels = LABELS[locale === "nb" ? "no" : locale] ?? LABELS.ar;
  const lines = [
    ...donation.items.map((item) => ({
      amount: item.amount, amountUSD: item.amountUSD, shareCount: item.shareCount,
      campaignTitle: item.campaign?.title?.trim() || labels.general,
    })),
    ...(donation.categoryItems ?? []).map((item) => ({
      amount: item.amount, amountUSD: item.amountUSD, shareCount: null,
      campaignTitle: item.category?.name?.trim() || labels.general,
    })),
    ...(donation.waqfItems ?? []).map((item) => ({
      amount: item.amount, amountUSD: item.amountUSD, shareCount: item.count,
      campaignTitle: item.unit === "METER" ? labels.meter : labels.share,
    })),
  ];
  return {
    campaignTitle: lines.map((line) => line.campaignTitle).join("، ") || labels.general,
    lines,
  };
}
