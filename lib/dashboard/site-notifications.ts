export type SiteNotification = { id: string; at: string; title: string; message: string; kind: "payment" | "subscription" | "account" | "site"; href: string | null };

/** Explicit public-site origins; a staff action can never enter by its title alone. */
export const SITE_ACTIVITY_WHERE = { OR: [{ stream: "SITE" }, { stream: "DONOR", actorRole: "DONOR" }] };
export const SITE_PAYMENT_WHERE = {
  provider: { in: ["ALBARAKA", "PAYFOR", "STRIPE", "PAYPAL"] },
  providerOrderId: { not: null },
  OR: [{ billingReason: { not: "subscription_test_cycle" } }, { billingReason: null }, { billingReason: { isSet: false } }],
};

/** Stable across both collections, including events with the same timestamp. */
export function notificationTimeWhere(field: "createdAt" | "paidAt", source: "activity" | "payment", cutoff: Date, cursor: string | null): Record<string, unknown> {
  if (!cursor) return { [field]: { lte: cutoff } };
  const [prefix,id] = cursor.split(":");
  const sameTime = source === prefix ? { id: { lt: id } } : source < prefix ? {} : { id: { in: [] } };
  return { OR: [{ [field]: { lt: cutoff } }, { [field]: cutoff, ...sameTime }] };
}

export function siteActivityNotification(row: { id: string; createdAt: Date; action: string; messageAr: string; entityType: string | null; entityId: string | null }): SiteNotification {
  const kind = /SUBSCRIPTION|RECURRING/.test(row.action) ? "subscription" : /DONATION|PAYMENT|TRANSFER/.test(row.action) ? "payment" : /USER|PROFILE|REGISTER|LOGIN/.test(row.action) ? "account" : "site";
  const href = row.entityId && /^[a-f0-9]{24}$/i.test(row.entityId) ? row.entityType === "Donation" ? `/dashboard?donationId=${row.entityId}` : row.entityType === "Message" ? "/dashboard/inbox" : row.entityType === "SubscriptionServiceRequest" ? `/dashboard/monthly?requestId=${row.entityId}` : null : null;
  return { id: `activity:${row.id}`, at: row.createdAt.toISOString(), title: kind === "subscription" ? "نشاط تبرع دوري" : kind === "payment" ? "نشاط تبرع" : kind === "account" ? "نشاط حساب متبرع" : "حدث في الموقع", message: row.messageAr, kind, href };
}

export function sitePaymentNotification(row: { id: string; createdAt: Date; paidAt: Date | null; status: string; billingReason: string | null; subscriptionId: string | null; currency: string; totalAmount: number }): SiteNotification {
  const paid = row.status === "PAID" && row.paidAt;
  const renewal = row.billingReason === "subscription_cycle";
  return { id: `payment:${row.id}`, at: (paid || row.createdAt).toISOString(), title: paid ? renewal ? "تجديد تبرع مؤكد" : "تبرع مؤكد" : row.status === "FAILED" ? "تعذّر إتمام التبرع" : "تبرع بانتظار التأكيد", message: `${row.totalAmount.toFixed(2)} ${row.currency}${row.subscriptionId ? " · تبرع دوري" : ""}`, kind: "payment", href: `/dashboard?donationId=${row.id}` };
}
