import type { MessagingCampaign, MessagingTemplate } from "./messaging-types";

export const messagingTemplates: MessagingTemplate[] = [
  {
    id: "msg_tpl_welcome_donor_whatsapp",
    title: "رسالة شكر بعد التبرع",
    channel: "WHATSAPP",
    category: "شكر المتبرع",
    language: "Turkish",
    body: "Sayın {{name}}, bağışınız için teşekkür ederiz. Desteğiniz ihtiyaç sahiplerine umut oluyor.",
    cta: "Bağış makbuzu ve güncellemeler için ekibimiz sizinle iletişimde kalacaktır.",
    variables: ["name"],
    status: "APPROVED",
    owner: "فريق التواصل",
    notes: "قالب تأسيسي قابل للتعديل أو الحذف.",
  },
  {
    id: "msg_tpl_ramadan_reminder_whatsapp",
    title: "تذكير حملة موسمية",
    channel: "WHATSAPP",
    category: "تذكير موسمي",
    language: "Turkish",
    body: "Ramazan iyilik ayıdır. Bugün yapacağınız destek bir ailenin sofrasına ulaşabilir.",
    cta: "Güvenli bağış için kampanya bağlantısını kullanabilirsiniz.",
    variables: [],
    status: "NEEDS_REVIEW",
    owner: "التسويق",
    notes: "لا يرسل تلقائيًا قبل المراجعة.",
  },
];

export const messagingCampaigns: MessagingCampaign[] = [
  {
    id: "msg_campaign_donor_thanks_flow",
    title: "متابعة شكر المتبرعين",
    channel: "WHATSAPP",
    objective: "رفع الثقة بعد التبرع",
    audience: "المتبرعون الجدد خلال آخر 7 أيام",
    templateId: "msg_tpl_welcome_donor_whatsapp",
    scheduledAt: "غير محدد",
    status: "READY_FOR_REVIEW",
    owner: "فريق التواصل",
    notes: "حملة تأسيسية قابلة للاستبدال بالمعتمد.",
  },
  {
    id: "msg_campaign_ramadan_reminder",
    title: "تذكير تبرع موسمي",
    channel: "WHATSAPP",
    objective: "تنشيط المتبرعين قبل نهاية الموسم",
    audience: "متبرعون سابقون لم يتبرعوا هذا الموسم",
    templateId: "msg_tpl_ramadan_reminder_whatsapp",
    scheduledAt: "غير محدد",
    status: "PLANNING",
    owner: "التسويق",
    notes: "لا يوجد إرسال خارجي من النظام الآن.",
  },
];
