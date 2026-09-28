/** Arabic labels for the concierge's internal vocabulary, as the dashboard shows it. */

export const INTENT_LABELS: Record<string, string> = {
  sadaqah_jariyah: "صدقة جارية",
  relief: "إغاثة",
  zakat: "زكاة",
  waqf: "وقف",
  recurring: "تبرع دوري",
  gift: "إهداء",
  explore: "استكشاف",
  most_needed: "الأشد حاجة",
  current_page: "المشروع الحالي",
  account: "حسابي وتبرعاتي",
  support: "دعم ومشكلة",
  question: "سؤال",
  unknown: "غير محدد",
};

export const LOCALE_LABELS: Record<string, string> = {
  ar: "العربية", en: "English", tr: "Türkçe", fr: "Français", de: "Deutsch", es: "Español",
  id: "Indonesia", pt: "Português", ur: "اردو", sq: "Shqip", it: "Italiano", nl: "Nederlands",
  sv: "Svenska", no: "Norsk", da: "Dansk", ms: "Melayu", ja: "日本語", zh: "中文", hi: "हिन्दी",
};

export const ROUTE_LABELS: Record<string, string> = {
  home: "الرئيسية", projects: "المشاريع", projectDetail: "صفحة مشروع", zakat: "الزكاة",
  zakatCalculator: "حاسبة الزكاة", waqf: "الوقف", recurring: "التبرع الدوري", aqsa: "المسجد الأقصى",
  jerusalem: "القدس", reports: "التقارير", reportDetail: "تقرير", blog: "المدونة", article: "مقال",
  news: "الأخبار", programs: "البرامج", about: "من نحن", contact: "تواصل معنا", volunteer: "تطوع",
  partner: "شراكة", bankAccounts: "الحسابات البنكية", account: "حسابي", unknown: "غير معروف",
};

export const EVENT_LABELS: Record<string, string> = {
  assistant_opened: "فتح المساعد",
  intent_selected: "اختار نية",
  message_sent: "أرسل رسالة",
  recommendation_shown: "عُرضت مشاريع",
  campaign_viewed: "فتح صفحة مشروع",
  campaign_selected: "اختار مشروعًا",
  donation_configured: "ظهر نموذج التبرع",
  donation_added_to_cart: "أضاف للسلة",
  cart_opened: "فتح السلة",
  checkout_started: "بدأ الدفع",
  zakat_started: "بدأ الزكاة",
  waqf_started: "بدأ الوقف",
  recurring_selected: "اختار تبرعًا دوريًا",
  gift_selected: "اختار إهداء",
  model_fallback: "أجاب بدون النموذج",
  order_created: "أُنشئ الطلب",
  support_ticket_sent: "أرسل رسالة للفريق",
};

export const BLOCK_LABELS: Record<string, string> = {
  campaign_recommendations: "مشاريع مقترحة",
  category_options: "مجالات",
  support_ticket: "نموذج رسالة للفريق",
  command: "طلب تغيير",
  suggestion: "اقتراح",
  donation_configuration: "نموذج تبرع",
  waqf_options: "خيارات الوقف",
  zakat_card: "بطاقة الزكاة",
  cart_confirmation: "تأكيد الإضافة للسلة",
  cross_sell: "اقتراح إضافي",
  notice: "تنبيه",
  donor_summary: "ملخص تبرعات المتبرع",
};

export const label = (map: Record<string, string>, key: string | null | undefined) => (key ? map[key] ?? key : "—");

export const usd = (n: number) => `$${(Number.isFinite(n) ? n : 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
export const num = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString("en-US");
export const pct = (n: number) => `${((Number.isFinite(n) ? n : 0) * 100).toFixed(1)}%`;

export function dateTime(iso: string | Date) {
  return new Date(iso).toLocaleString("ar-EG", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", numberingSystem: "latn" });
}

export function shortDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("ar-EG", { day: "numeric", month: "short", timeZone: "UTC", numberingSystem: "latn" });
}
