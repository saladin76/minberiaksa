import type { ScheduledContentItem } from "./scheduler-types";
import { dt } from "@/lib/dashboard/i18n";

// Foundation scheduler data. Later this can be replaced by a Prisma-backed repository
// while keeping the dashboard page and API contract stable.
export const scheduledContentItems: ScheduledContentItem[] = [
  {
    id: "fri-gaza-whatsapp",
    get title() { return dt("رسالة واتساب لعطاء الجمعة - غزة"); },
    channel: "WHATSAPP",
    status: "SCHEDULED",
    campaignTheme: "Friday Giving / Gaza",
    get scheduledFor() { return dt("الجمعة 10:00"); },
    owner: "Marketing Team",
    providerKey: "whatsapp",
    contentUrl: "/dashboard/operations/production",
    get note() { return dt("تحتاج مراجعة نهائية للنص قبل الإرسال."); },
  },
  {
    id: "waqf-email-story",
    get title() { return dt("إيميل قصة وقف الأقصى"); },
    channel: "EMAIL",
    status: "READY",
    campaignTheme: "Al-Quds Waqf",
    get scheduledFor() { return dt("الأحد 18:00"); },
    owner: "Content Team",
    providerKey: "email",
    contentUrl: "/dashboard/operations/archive",
    get note() { return dt("جاهز للتسليم بعد مراجعة رابط التبرع."); },
  },
  {
    id: "ramadan-team-reminder",
    get title() { return dt("تذكير تجهيز خطة رمضان"); },
    channel: "TEAM_REMINDER",
    status: "SCHEDULED",
    campaignTheme: "Ramadan Planning",
    get scheduledFor() { return dt("قبل رمضان بـ 45 يوم"); },
    owner: "Operations Lead",
    get note() { return dt("تنبيه داخلي فقط، لا إرسال خارجي."); },
  },
  {
    id: "sms-zakat-reminder",
    get title() { return dt("SMS تذكير الزكاة"); },
    channel: "SMS",
    status: "BLOCKED",
    campaignTheme: "Zakat",
    get scheduledFor() { return dt("الخميس 14:00"); },
    owner: "Marketing Team",
    providerKey: "netgsm",
    get note() { return dt("محجوب لحين اكتمال اتصال Netgsm وصحة القالب."); },
  },
  {
    id: "social-reel-proof",
    get title() { return dt("نشر Reel إثبات توزيع"); },
    channel: "SOCIAL",
    status: "DRAFT",
    campaignTheme: "Proof / Impact",
    get scheduledFor() { return dt("الثلاثاء 20:30"); },
    owner: "Media Team",
    contentUrl: "/dashboard/operations/archive",
    get note() { return dt("يحتاج اختيار فيديو من الأرشيف وربطه بالحملة."); },
  },
];
