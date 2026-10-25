import { checkCardFields } from "./card-validation";
import { digitsOnly } from "./numeric-input";

export type CheckoutField = "firstName" | "email" | "phone" | "cardNumber" | "cardExpiry" | "cardCvc";
export type CheckoutFieldIssue = {
  field: CheckoutField;
  message: "required" | "invalidEmail" | "invalidPhone" | "invalidCardNumber" | "invalidCardExpiry" | "invalidCardCvc";
};

/** Validate before creating an order. Messages contain keys only, never input values. */
export function checkoutFieldIssue(details: {
  firstName: string; email: string; phone: string;
  requireName: boolean; requireCard: boolean;
  cardNumber: string; cardExpiry: string; cardCvc: string;
}): CheckoutFieldIssue | null {
  if (details.requireName && !details.firstName.trim()) return { field: "firstName", message: "required" };
  if (!details.email.trim()) return { field: "email", message: "required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) return { field: "email", message: "invalidEmail" };
  const phone = digitsOnly(details.phone);
  if (!phone) return { field: "phone", message: "required" };
  if (phone.length < 7 || phone.length > 15) return { field: "phone", message: "invalidPhone" };
  if (details.requireCard) {
    for (const field of ["cardNumber", "cardExpiry", "cardCvc"] as const) {
      if (!details[field].trim()) return { field, message: "required" };
    }
    const message = checkCardFields(details.cardNumber, details.cardExpiry, details.cardCvc);
    if (message) return { field: message === "invalidCardNumber" ? "cardNumber" : message === "invalidCardExpiry" ? "cardExpiry" : "cardCvc", message };
  }
  return null;
}
