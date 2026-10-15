import { dashIntl, dt } from "@/lib/dashboard/i18n";
/** Arabic labels for the concierge's internal vocabulary, as the dashboard shows it. */

export const INTENT_LABELS: Record<string, string> = {
  get sadaqah_jariyah() { return dt("صدقة جارية"); },
  get relief() { return dt("إغاثة"); },
  get zakat() { return dt("زكاة"); },
  get waqf() { return dt("وقف"); },
  get recurring() { return dt("تبرع دوري"); },
  get gift() { return dt("إهداء"); },
  get explore() { return dt("استكشاف"); },
  get most_needed() { return dt("الأشد حاجة"); },
  get current_page() { return dt("المشروع الحالي"); },
  get account() { return dt("حسابي وتبرعاتي"); },
  get support() { return dt("دعم ومشكلة"); },
  get question() { return dt("سؤال"); },
  get unknown() { return dt("غير محدد"); },
};

export const LOCALE_LABELS: Record<string, string> = {
  ar: "العربية", en: "English", tr: "Türkçe", fr: "Français", de: "Deutsch", es: "Español",
  id: "Indonesia", pt: "Português", get ur() { return dt("اردو"); }, sq: "Shqip", it: "Italiano", nl: "Nederlands",
  sv: "Svenska", no: "Norsk", da: "Dansk", ms: "Melayu", ja: "日本語", zh: "中文", hi: "हिन्दी",
};

export const ROUTE_LABELS: Record<string, string> = {
  get home() { return dt("الرئيسية"); }, get projects() { return dt("المشاريع"); }, get projectDetail() { return dt("صفحة مشروع"); }, get zakat() { return dt("الزكاة"); },
  get zakatCalculator() { return dt("حاسبة الزكاة"); }, get waqf() { return dt("الوقف"); }, get recurring() { return dt("التبرع الدوري"); }, get aqsa() { return dt("المسجد الأقصى"); },
  get jerusalem() { return dt("القدس"); }, get reports() { return dt("التقارير"); }, get reportDetail() { return dt("تقرير"); }, get blog() { return dt("المدونة"); }, get article() { return dt("مقال"); },
  get news() { return dt("الأخبار"); }, get programs() { return dt("البرامج"); }, get about() { return dt("من نحن"); }, get contact() { return dt("تواصل معنا"); }, get volunteer() { return dt("تطوع"); },
  get partner() { return dt("شراكة"); }, get bankAccounts() { return dt("الحسابات البنكية"); }, get account() { return dt("حسابي"); }, get unknown() { return dt("غير معروف"); },
};

export const EVENT_LABELS: Record<string, string> = {
  get assistant_opened() { return dt("فتح المساعد"); },
  get intent_selected() { return dt("اختار نية"); },
  get message_sent() { return dt("أرسل رسالة"); },
  get recommendation_shown() { return dt("عُرضت مشاريع"); },
  get campaign_viewed() { return dt("فتح صفحة مشروع"); },
  get campaign_selected() { return dt("اختار مشروعًا"); },
  get donation_configured() { return dt("ظهر نموذج التبرع"); },
  get donation_added_to_cart() { return dt("أضاف للسلة"); },
  get cart_opened() { return dt("فتح السلة"); },
  get checkout_started() { return dt("بدأ الدفع"); },
  get zakat_started() { return dt("بدأ الزكاة"); },
  get waqf_started() { return dt("بدأ الوقف"); },
  get recurring_selected() { return dt("اختار تبرعًا دوريًا"); },
  get gift_selected() { return dt("اختار إهداء"); },
  get model_fallback() { return dt("أجاب بدون النموذج"); },
  get order_created() { return dt("أُنشئ الطلب"); },
  get support_ticket_sent() { return dt("أرسل رسالة للفريق"); },
};

export const BLOCK_LABELS: Record<string, string> = {
  get campaign_recommendations() { return dt("مشاريع مقترحة"); },
  get category_options() { return dt("مجالات"); },
  get support_ticket() { return dt("نموذج رسالة للفريق"); },
  get command() { return dt("طلب تغيير"); },
  get suggestion() { return dt("اقتراح"); },
  get donation_configuration() { return dt("نموذج تبرع"); },
  get waqf_options() { return dt("خيارات الوقف"); },
  get zakat_card() { return dt("بطاقة الزكاة"); },
  get cart_confirmation() { return dt("تأكيد الإضافة للسلة"); },
  get cross_sell() { return dt("اقتراح إضافي"); },
  get notice() { return dt("تنبيه"); },
  get donor_summary() { return dt("ملخص تبرعات المتبرع"); },
};

export const label = (map: Record<string, string>, key: string | null | undefined) => (key ? map[key] ?? key : "—");

export const usd = (n: number) => `$${(Number.isFinite(n) ? n : 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
export const num = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString("en-US");
export const pct = (n: number) => `${((Number.isFinite(n) ? n : 0) * 100).toFixed(1)}%`;

export function dateTime(iso: string | Date) {
  return new Date(iso).toLocaleString(dashIntl("ar-EG"), { timeZone: "Europe/Istanbul", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", numberingSystem: "latn" });
}

export function shortDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(dashIntl("ar-EG"), { day: "numeric", month: "short", timeZone: "UTC", numberingSystem: "latn" });
}
