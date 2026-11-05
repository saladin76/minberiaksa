/** A result handoff reads the existing payment; it must never initiate another charge. */
export function albarakaResultPath(donationId: string, locale: string, token?: string | null): string {
  if (!/^[a-f\d]{24}$/i.test(donationId)) throw new Error("invalid-donation-id");
  const query = new URLSearchParams({ donationId, locale });
  if (token) query.set("t", token);
  return `/api/albaraka/2d/result?${query}`;
}

export function paymentResultTarget(actionUrl: string, currentOrigin: string): string {
  const current = new URL(currentOrigin);
  const target = new URL(actionUrl, current.origin);
  const sameSiteAlias = target.protocol === current.protocol && target.port === current.port &&
    target.hostname.replace(/^www\./i, "") === current.hostname.replace(/^www\./i, "");
  if (target.username || target.password || !["http:", "https:"].includes(target.protocol) ||
    (target.origin !== current.origin && !sameSiteAlias) ||
    !(target.pathname === "/api/albaraka/2d/result" || /\/(success|donation-failed|payment-processing)(\/|$)/.test(target.pathname))) {
    throw new Error("invalid-payment-result-url");
  }
  // Keep the browser's host/session even when APP_URL uses the www alias.
  return new URL(`${target.pathname}${target.search}`, current.origin).href;
}

export function navigatePaymentResult(target: string, clearBasket: () => void, navigate: (url: string) => void): void {
  try { clearBasket(); } catch { /* Browser storage is not evidence that the bank declined. */ }
  navigate(target);
}

export function needsPaymentResultCheck(status?: number, code?: string): boolean {
  return status === undefined || status === 0 || status >= 500 || code === "PAYMENT_ALREADY_PROCESSING";
}
