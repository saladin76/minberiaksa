import type { OperationsOverview } from "./types";
import { dt } from "@/lib/dashboard/i18n";

export function createFallbackOperationsOverview(): OperationsOverview {
  return {
    source: "fallback",
    version: "operations-overview-fallback",
    generatedAt: new Date().toISOString(),
    kpis: {
      openSeasons: 5,
      activePlans: 3,
      contentItems: 39,
      openProductionTasks: 4,
      readyForMarketing: 1,
    },
    seasons: [
      { id: "ramadan", title: dt("رمضان"), focus: dt("زكاة، إفطار، صدقة يومية"), status: "PLANNING", period: dt("مارس 2027"), required: 30, ready: 8, progress: 27 },
      { id: "dhul-hijjah", title: dt("عشر ذي الحجة"), focus: dt("أضاحي، وقف، تذكير يومي"), status: "PLANNING", period: dt("يونيو 2027"), required: 18, ready: 4, progress: 22 },
      { id: "aqsa-waqf", title: dt("القدس والوقف"), focus: dt("وقف، حماية المقدسات، تقارير أثر"), status: "ACTIVE", period: dt("مستمرة"), required: 16, ready: 7, progress: 44 },
      { id: "gaza", title: dt("غزة العاجلة"), focus: dt("إغاثة، غذاء، فيديوهات ميدانية"), status: "ACTIVE", period: dt("هذا الشهر"), required: 12, ready: 5, progress: 42 },
      { id: "winter", title: dt("الشتاء"), focus: dt("دفء، بطانيات، سلال غذائية"), status: "UPCOMING", period: dt("نوفمبر"), required: 10, ready: 1, progress: 10 },
    ],
    weeklyThemes: [
      { id: "week-1", week: dt("الأسبوع 1"), theme: dt("القدس"), description: dt("محتوى وقف وتوعية") },
      { id: "week-2", week: dt("الأسبوع 2"), theme: dt("غزة"), description: dt("إغاثة وتقارير ميدانية") },
      { id: "week-3", week: dt("الأسبوع 3"), theme: dt("الوقف"), description: dt("شرح الأثر والاستدامة") },
      { id: "week-4", week: dt("الأسبوع 4"), theme: dt("الزكاة"), description: dt("تثقيف وتحويل للتبرع") },
    ],
    plans: [
      { id: "ramadan-2027", title: dt("رمضان 2027"), theme: dt("زكاة، إفطار، وصدقة يومية"), status: "PLANNING", items: 18, published: 0, date: dt("مارس 2027") },
      { id: "dhul-hijjah", title: dt("عشر ذي الحجة"), theme: dt("أضاحي، وقف، ورسائل تذكير"), status: "PLANNING", items: 12, published: 0, date: dt("يونيو 2027") },
      { id: "aqsa-waqf", title: dt("حملة الوقف للقدس"), theme: dt("محتوى توعوي + شهادات وقف"), status: "ACTIVE", items: 9, published: 3, date: dt("مستمرة") },
    ],
    items: [
      { id: "daily-ramadan", title: dt("فكرة سلسلة رمضان اليومية"), type: "IDEA", status: "IDEA", channel: "All Channels", due: dt("هذا الشهر") },
      { id: "zakat-carousel", title: dt("كاروسيل: كيف تحسب زكاتك؟"), type: "CAROUSEL", status: "WRITING", channel: "Instagram", due: dt("هذا الأسبوع") },
      { id: "gaza-design", title: dt("تصميم حملة غزة العاجلة"), type: "DESIGN", status: "DESIGN", channel: "Meta Ads", due: dt("غدًا") },
      { id: "waqf-video", title: dt("فيديو تعريفي عن الوقف"), type: "VIDEO", status: "REVIEW", channel: "YouTube / Reels", due: dt("الأسبوع القادم") },
      { id: "friday-whatsapp", title: dt("رسالة واتساب للجمعة"), type: "WHATSAPP", status: "APPROVED", channel: "WhatsApp", due: dt("الجمعة") },
    ],
    tasks: [
      { id: "task-waqf-script", title: dt("كتابة نص فيديو الوقف"), owner: dt("فريق المحتوى"), status: "IN_PROGRESS", due: dt("12 يونيو"), item: dt("فيديو تعريفي عن الوقف") },
      { id: "task-zakat-design", title: dt("تصميم كاروسيل الزكاة"), owner: dt("فريق التصميم"), status: "REVIEW", due: dt("13 يونيو"), item: dt("كاروسيل: كيف تحسب زكاتك؟") },
      { id: "task-gaza-edit", title: dt("مونتاج فيديو غزة"), owner: dt("فريق الميديا"), status: "DESIGN", due: dt("14 يونيو"), item: dt("تصميم حملة غزة العاجلة") },
      { id: "task-friday-whatsapp", title: dt("تجهيز رسالة واتساب الجمعة"), owner: dt("التسويق"), status: "APPROVED", due: dt("الجمعة"), item: dt("رسالة واتساب للجمعة") },
    ],
  };
}
