/**
 * How an AuditLog row is presented in سجلات النظام.
 *
 * Two problems this fixes, both visible in the live log:
 *
 * 1. **Actor.** Rows written by cron jobs and server pipelines carry
 *    `actorRole: "SYSTEM"` and no `actorName`, so the table rendered "—" next to
 *    a "visitor" icon, and the *stream* badge ("فريق") sat beside it — which
 *    reads as "a team member did this" when nobody did.
 *
 * 2. **Volume.** Over a sample fortnight, five actions were 94% of the log and a
 *    single cron heartbeat — «تشغيل جدولة التواصل — 0 حملة مستحقة», written every
 *    few minutes whether or not there was anything to send — was 71% of it.
 *    Real human activity was ~6% of rows and unfindable.
 *
 * The API answers this by excluding `actorRole: "SYSTEM"` outright, so the page
 * shows only rows with a person behind them. That covers every automated writer
 * — including ones added later — where an action deny-list would have needed
 * maintenance forever.
 *
 * The rows are not deleted: `getSchedulerStatus()` reads the heartbeat to show
 * «آخر تشغيل» on the providers page, and the marketing conversion dashboard
 * falls back to `CONVERSION_TRACKING_AUDIT` rows when the `ConversionEvent`
 * collection is empty.
 */

export const ACTOR_ROLE_LABEL_AR: Record<string, string> = {
  SYSTEM: "النظام",
  ADMIN: "مدير",
  STAFF: "طاقم",
  DONOR: "متبرع",
  GUEST: "زائر",
};

/**
 * The name to show in the الاسم column. Automated rows have no person behind
 * them, so they get the role label instead of an em dash.
 */
export function displayActorName(row: { actorName?: string | null; actorRole: string }): string {
  if (row.actorName && row.actorName.trim()) return row.actorName.trim();
  return ACTOR_ROLE_LABEL_AR[row.actorRole] ?? "غير معروف";
}

/** Human labels for the automation event keys that used to leak raw into messages. */
export const TRIGGER_EVENT_LABEL_AR: Record<string, string> = {
  DONATION_PAID: "تبرّع ناجح",
  DONATION_FAILED: "تبرّع فاشل",
  FIRST_DONATION: "أول تبرّع",
  USER_REGISTERED: "تسجيل مستخدم جديد",
  SUBSCRIPTION_CREATED: "اشتراك شهري جديد",
  SUBSCRIPTION_PAYMENT: "دفعة اشتراك شهري",
  SUBSCRIPTION_CANCELLED: "إلغاء اشتراك شهري",
  DONATION_LAPSED: "متبرّع متوقّف",
};

export function triggerEventLabelAr(event: string): string {
  return TRIGGER_EVENT_LABEL_AR[event] ?? event;
}
