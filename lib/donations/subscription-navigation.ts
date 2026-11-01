export type SubscriptionRequestRow = {
  id: string;
  donorId: string;
  donorName: string;
  subscriptionId: string;
  kind: string;
  requestedAmount: number | null;
  currency: string;
  note: string;
  staffNote: string | null;
  status: string;
  createdAt: string;
};

export function subscriptionManagementHref(donorId: string, subscriptionId?: string, requestId?: string) {
  const params = new URLSearchParams({ userId: donorId });
  if (subscriptionId) params.set("subscriptionId", subscriptionId);
  if (requestId) params.set("requestId", requestId);
  return `/dashboard/monthly?${params}#subscriptions`;
}

export function profileSubscriptionsHref(locale: string, subscriptionId: string) {
  const params = new URLSearchParams({ tab: "subscriptions", subscriptionId });
  return `/${locale}/profile?${params}#profile-subscription-${encodeURIComponent(subscriptionId)}`;
}

/** Called after the matching table has rendered, including same-page links. */
export function focusSubscriptionTarget(subscriptionId?: string) {
  if (typeof document === "undefined") return;
  const target = (subscriptionId ? document.getElementById(`subscription-${subscriptionId}`) : null) || document.getElementById("subscriptions");
  target?.scrollIntoView({ block: "start", behavior: "instant" });
  target?.focus({ preventScroll: true });
}
