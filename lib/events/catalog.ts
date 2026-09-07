import type { MessageTriggerEvent } from "./dispatch";

/**
 * Timing defaults + guard rails for scheduled triggers (DONATION_LAPSED). They live here rather
 * than in `donation-lapsed.ts` because the dashboard client components need them and that module
 * pulls in Prisma.
 */
export const DEFAULT_LAPSE_DAYS = 30;
export const DEFAULT_COOLDOWN_DAYS = 90;
export const MIN_LAPSE_DAYS = 1;
export const MAX_LAPSE_DAYS = 3650;
export const MIN_COOLDOWN_DAYS = 1;
export const MAX_COOLDOWN_DAYS = 3650;

export interface EventDefinition {
  event: MessageTriggerEvent;
  label: string;
  description: string;
  /** Whether donation context ({{donation.*}}) is available */
  hasDonation: boolean;
  /**
   * Scheduled events are not fired by a webhook — a daily cron evaluates them and they expose the
   * `lapseDays` / `cooldownDays` timing settings in the dashboard.
   */
  scheduled?: boolean;
}

export const EVENT_CATALOG: EventDefinition[] = [
  {
    event: "DONATION_PAID",
    label: "تبرّع ناجح",
    description: "يُرسل عند نجاح الدفع وانتقال التبرّع إلى الحالة PAID.",
    hasDonation: true,
  },
  {
    event: "DONATION_FAILED",
    label: "تبرّع فاشل",
    description: "يُرسل عند فشل الدفع وانتقال التبرّع إلى الحالة FAILED.",
    hasDonation: true,
  },
  {
    event: "FIRST_DONATION",
    label: "أول تبرّع للمتبرع",
    description: "يُرسل بعد DONATION_PAID فقط عندما يكون هذا أول تبرّع ناجح للمتبرع.",
    hasDonation: true,
  },
  {
    event: "USER_REGISTERED",
    label: "تسجيل مستخدم جديد",
    description: "يُرسل بعد إنشاء الحساب — لا يحتوي على بيانات تبرّع.",
    hasDonation: false,
  },
  {
    event: "SUBSCRIPTION_CREATED",
    label: "اشتراك شهري جديد",
    description: "يُرسل عند إنشاء اشتراك تبرّع متكرّر.",
    hasDonation: false,
  },
  {
    event: "SUBSCRIPTION_PAYMENT",
    label: "تجديد اشتراك ناجح",
    description: "يُرسل عند نجاح خصم اشتراك متكرّر — يحوي بيانات التبرّعة المتولّدة.",
    hasDonation: true,
  },
  {
    event: "SUBSCRIPTION_CANCELLED",
    label: "إلغاء اشتراك",
    description: "يُرسل عند إلغاء اشتراك متكرّر.",
    hasDonation: false,
  },
  {
    event: "DONATION_LAPSED",
    label: "تذكير بالتبرّع مجددًا",
    description:
      "يُرسل تلقائيًا للمتبرّع الذي مضى على آخر تبرّع ناجح له المدة المحدّدة (٣٠ يومًا افتراضيًا) لتشجيعه على التبرّع مجددًا. يُفحص يوميًا، ويستثني المشتركين شهريًا ومن ألغى الاشتراك بالرسائل، ولا يُكرَّر لنفس المتبرّع قبل انتهاء فترة الانتظار.",
    hasDonation: true,
    scheduled: true,
  },
];

export function getEventDefinition(e: MessageTriggerEvent): EventDefinition | undefined {
  return EVENT_CATALOG.find((d) => d.event === e);
}
