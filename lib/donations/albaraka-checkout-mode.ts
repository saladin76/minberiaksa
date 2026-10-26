export type AlbarakaCheckoutMode = "2D" | "3D";

/** Missing mode retains compatibility with older checkout clients. */
export function albarakaCheckoutMode(requested: unknown, recurring: boolean): AlbarakaCheckoutMode {
  if (requested !== undefined && requested !== null && requested !== "2D" && requested !== "3D") throw new Error("INVALID_PAYMENT_MODE");
  return recurring ? "2D" : requested === "3D" ? "3D" : "2D";
}
