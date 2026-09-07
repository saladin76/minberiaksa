import type { OperationsOverview } from "./types";

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
      { id: "ramadan", title: "رمضان", focus: "زكاة، إفطار، صدقة يومية", status: "PLANNING", period: "مارس 2027", required: 30, ready: 8, progress: 27 },
      { id: "dhul-hijjah", title: "عشر ذي الحجة", focus: "أضاحي، وقف، تذكير يومي", status: "PLANNING", period: "يونيو 2027", required: 18, ready: 4, progress: 22 },
      { id: "aqsa-waqf", title: "القدس والوقف", focus: "وقف، حماية المقدسات، تقارير أثر", status: "ACTIVE", period: "مستمرة", required: 16, ready: 7, progress: 44 },
      { id: "gaza", title: "غزة العاجلة", focus: "إغاثة، غذاء، فيديوهات ميدانية", status: "ACTIVE", period: "هذا الشهر", required: 12, ready: 5, progress: 42 },
      { id: "winter", title: "الشتاء", focus: "دفء، بطانيات، سلال غذائية", status: "UPCOMING", period: "نوفمبر", required: 10, ready: 1, progress: 10 },
    ],
    weeklyThemes: [
      { id: "week-1", week: "الأسبوع 1", theme: "القدس", description: "محتوى وقف وتوعية" },
      { id: "week-2", week: "الأسبوع 2", theme: "غزة", description: "إغاثة وتقارير ميدانية" },
      { id: "week-3", week: "الأسبوع 3", theme: "الوقف", description: "شرح الأثر والاستدامة" },
      { id: "week-4", week: "الأسبوع 4", theme: "الزكاة", description: "تثقيف وتحويل للتبرع" },
    ],
    plans: [
      { id: "ramadan-2027", title: "رمضان 2027", theme: "زكاة، إفطار، وصدقة يومية", status: "PLANNING", items: 18, published: 0, date: "مارس 2027" },
      { id: "dhul-hijjah", title: "عشر ذي الحجة", theme: "أضاحي، وقف، ورسائل تذكير", status: "PLANNING", items: 12, published: 0, date: "يونيو 2027" },
      { id: "aqsa-waqf", title: "حملة الوقف للقدس", theme: "محتوى توعوي + شهادات وقف", status: "ACTIVE", items: 9, published: 3, date: "مستمرة" },
    ],
    items: [
      { id: "daily-ramadan", title: "فكرة سلسلة رمضان اليومية", type: "IDEA", status: "IDEA", channel: "All Channels", due: "هذا الشهر" },
      { id: "zakat-carousel", title: "كاروسيل: كيف تحسب زكاتك؟", type: "CAROUSEL", status: "WRITING", channel: "Instagram", due: "هذا الأسبوع" },
      { id: "gaza-design", title: "تصميم حملة غزة العاجلة", type: "DESIGN", status: "DESIGN", channel: "Meta Ads", due: "غدًا" },
      { id: "waqf-video", title: "فيديو تعريفي عن الوقف", type: "VIDEO", status: "REVIEW", channel: "YouTube / Reels", due: "الأسبوع القادم" },
      { id: "friday-whatsapp", title: "رسالة واتساب للجمعة", type: "WHATSAPP", status: "APPROVED", channel: "WhatsApp", due: "الجمعة" },
    ],
    tasks: [
      { id: "task-waqf-script", title: "كتابة نص فيديو الوقف", owner: "فريق المحتوى", status: "IN_PROGRESS", due: "12 يونيو", item: "فيديو تعريفي عن الوقف" },
      { id: "task-zakat-design", title: "تصميم كاروسيل الزكاة", owner: "فريق التصميم", status: "REVIEW", due: "13 يونيو", item: "كاروسيل: كيف تحسب زكاتك؟" },
      { id: "task-gaza-edit", title: "مونتاج فيديو غزة", owner: "فريق الميديا", status: "DESIGN", due: "14 يونيو", item: "تصميم حملة غزة العاجلة" },
      { id: "task-friday-whatsapp", title: "تجهيز رسالة واتساب الجمعة", owner: "التسويق", status: "APPROVED", due: "الجمعة", item: "رسالة واتساب للجمعة" },
    ],
  };
}
