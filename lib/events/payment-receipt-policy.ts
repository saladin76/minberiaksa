export const PAYMENT_RECEIPT_EVENTS = ["DONATION_PAID", "SUBSCRIPTION_CREATED", "SUBSCRIPTION_PAYMENT"] as const;
export type PaymentReceiptEvent = typeof PAYMENT_RECEIPT_EVENTS[number];
export function isPaymentReceiptEvent(event: string): event is PaymentReceiptEvent {
  return (PAYMENT_RECEIPT_EVENTS as readonly string[]).includes(event);
}
/** Classify the actual payment, independently of which callback emitted it. */
export function paymentReceiptEvent(donation: { subscription?: { status?: string } | null; subscriptionId?: string | null; billingReason?: string | null; providerTxnType?: string | null }): PaymentReceiptEvent {
  if (!donation.subscription && !donation.subscriptionId) return "DONATION_PAID";
  const renewal = ["subscription_cycle", "subscription_test_cycle", "subscription_update", "manual"].includes(donation.billingReason ?? "") || ["recurringsale", "recurringcapture"].includes((donation.providerTxnType ?? "").toLowerCase());
  if (renewal) return "SUBSCRIPTION_PAYMENT";
  return ["PAUSED", "CANCELLED", "PAYMENT_FAILED"].includes(donation.subscription?.status ?? "") ? "DONATION_PAID" : "SUBSCRIPTION_CREATED";
}
type Trigger = {id?:string;event:string;channel:string;templateId:string};
/** One receipt per channel. Prefer the cadence-aware event, with one generic
 * fallback for channels without that template. Never send both candidates. */
export function paymentReceiptTriggerGroups<T extends Trigger>(triggers:T[], event:PaymentReceiptEvent):T[][] {
  const channels = [...new Set(triggers.map(trigger=>trigger.channel))].sort();
  const ordered=[...triggers].sort((a,b)=>(a.id??a.templateId).localeCompare(b.id??b.templateId));
  return channels.flatMap(channel=>{
    const primary=ordered.find(trigger=>trigger.channel===channel&&trigger.event===event);
    const fallback=event!=="DONATION_PAID"?ordered.find(trigger=>trigger.channel===channel&&trigger.event==="DONATION_PAID"):undefined;
    const candidates=[primary,fallback].filter((trigger):trigger is T=>Boolean(trigger));
    return candidates.length?[candidates]:[];
  });
}
/** Only definite pre-send template refusals permit another candidate.
 * Unknown delivery, recipient opt-out and deduplication never trigger fallback. */
export function canFallbackReceipt(outcome:{outcome:string;reason?:string}|null):boolean {
  if (!outcome) return true;
  return outcome.outcome==="SKIPPED" && new Set([
    "TEMPLATE_NOT_FOUND","TEMPLATE_NOT_APPROVED","META_TEMPLATE_NOT_APPROVED","WHATSAPP_TEMPLATE_NOT_APPROVED",
    "META_TEMPLATE_MAPPING_REQUIRED","META_DIRECT_SEND_OR_TEMPLATE_REQUIRED","META_TEMPLATE_CATEGORY_MISMATCH","EXACT_TEMPLATE_LANGUAGE_REQUIRED","RECURRING_TEMPLATE_CADENCE_MISMATCH",
  ]).has(outcome.reason??"");
}
