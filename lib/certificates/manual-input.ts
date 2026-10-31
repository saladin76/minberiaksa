import { z } from "zod";
import { isValidLocale } from "../locales";
import { normalizeGiftPhone } from "../donations/gift-order";

const manualCertificateFields = z.object({
  kind: z.enum(["THANKS", "SHARE", "METER", "RECEIPT"]),
  locale: z.string().refine(isValidLocale, "Unsupported document language"),
  donorName: z.string().trim().min(2).max(120),
  recipientName: z.string().trim().max(120).default(""),
  email: z.string().trim().max(254).default("").refine(value => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Invalid recipient email"),
  phone: z.string().trim().max(40).default("").transform(value => value ? normalizeGiftPhone(value) || "INVALID" : "").refine(value => value !== "INVALID", "Use an international phone number"),
  projectTitle: z.string().trim().max(200).default(""),
  amount: z.coerce.number().finite().min(0).max(100_000_000).default(0),
  currency: z.string().regex(/^[A-Z]{3}$/).default("USD"),
  count: z.coerce.number().int().min(1).max(100_000).default(1),
  dedicatedTo: z.string().trim().max(150).default(""),
  note: z.string().trim().max(400).default(""),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(value + "T12:00:00Z"); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }, "Invalid issue date"),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "CARD", "PAYPAL"]).default("CASH"),
  received: z.boolean().default(false),
});
function checkDocument(input: z.infer<typeof manualCertificateFields>, ctx: z.RefinementCtx, requireReceived: boolean) {
  if (input.kind !== "THANKS" && input.amount <= 0) ctx.addIssue({ code: "custom", path: ["amount"], message: "A positive amount is required" });
  if (input.kind === "RECEIPT" && ((requireReceived && !input.received) || !input.projectTitle)) ctx.addIssue({ code: "custom", path: ["received"], message: "Confirm receipt of funds and enter the project or purpose" });
}
// A marked PREVIEW is not an assertion that funds were received. Issuance still
// requires the operator's confirmation and a preview bound to that exact input.
export const manualCertificatePreviewInput = manualCertificateFields.superRefine((input, ctx) => checkDocument(input, ctx, false));
export const manualCertificateInput = manualCertificateFields.superRefine((input, ctx) => checkDocument(input, ctx, true));
export type ManualCertificateInput = z.infer<typeof manualCertificateInput>;
