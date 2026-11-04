export type AlbarakaCheckoutMode = "2D" | "3D";

/** Missing mode retains compatibility with older checkout clients. */
export function albarakaCheckoutMode(requested: unknown, recurring: boolean, mixedBasket = false): AlbarakaCheckoutMode {
  if (requested !== undefined && requested !== null && requested !== "2D" && requested !== "3D") throw new Error("INVALID_PAYMENT_MODE");
  return recurring && mixedBasket ? "3D" : recurring ? "2D" : requested === "3D" ? "3D" : "2D";
}

/** Server-written checkout split; never trust a client security-mode downgrade. */
export function isMixedRecurringCheckout(attribution: unknown): boolean {
  if (!attribution || typeof attribution !== "object" || Array.isArray(attribution)) return false;
  const value = attribution as Record<string, unknown>;
  return typeof value.one_time_principal === "number" && value.one_time_principal > 0
    && typeof value.recurring_principal === "number" && value.recurring_principal > 0;
}
