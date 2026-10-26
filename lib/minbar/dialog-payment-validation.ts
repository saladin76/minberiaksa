import { checkCardFields } from "./card-validation";

export type DialogPaymentField = "firstName" | "lastName" | "email" | "phone" | "cardNumber" | "expiryDate" | "cvv" | "cardholderName";
export function dialogPaymentIssue(input: {
  guest: boolean; firstName: string; lastName: string; email: string; phoneValid: boolean;
  cardRequired: boolean; savedCard: boolean;
  card: { cardNumber: string; expiryDate: string; cvv: string; cardholderName: string };
}): { field: DialogPaymentField; message: string } | null {
  if (input.guest) {
    if (!input.firstName.trim()) return { field: "firstName", message: "required" };
    if (!input.lastName.trim()) return { field: "lastName", message: "required" };
    if (!input.email.trim()) return { field: "email", message: "required" };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return { field: "email", message: "invalidEmail" };
  }
  if (!input.phoneValid) return { field: "phone", message: "invalidPhone" };
  if (input.cardRequired) {
    if (input.savedCard) return /^\d{3,4}$/.test(input.card.cvv) ? null : { field: "cvv", message: "invalidCardCvc" };
    for (const field of ["cardNumber", "cardholderName", "expiryDate", "cvv"] as const) {
      if (!input.card[field].trim()) return { field, message: "required" };
    }
    const error = checkCardFields(input.card.cardNumber, input.card.expiryDate, input.card.cvv);
    if (error) return { field: error === "invalidCardNumber" ? "cardNumber" : error === "invalidCardExpiry" ? "expiryDate" : "cvv", message: error };
  }
  return null;
}
