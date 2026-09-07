export type TemplateVariable = {
  key: string;
  label: string;
  /**
   * Safe, clearly-marked placeholder used ONLY for internal preview rendering. This is deliberately
   * NOT a real/fake donor name, amount, id, or URL — it is a bracketed label so previews never show
   * fabricated data. The Template Center UI does not display these to the user.
   */
  sample: string;
  category: "donor" | "donation" | "campaign" | "system";
};

export const communicationTemplateVariables: TemplateVariable[] = [
  { key: "donor_name", label: "اسم المتبرع", sample: "«اسم المتبرع»", category: "donor" },
  { key: "amount", label: "قيمة التبرع", sample: "«المبلغ»", category: "donation" },
  { key: "currency", label: "العملة", sample: "«العملة»", category: "donation" },
  { key: "campaign_name", label: "اسم الحملة", sample: "«اسم الحملة»", category: "campaign" },
  { key: "donation_id", label: "رقم التبرع", sample: "«رقم التبرع»", category: "donation" },
  { key: "receipt_url", label: "رابط الإيصال", sample: "«رابط الإيصال»", category: "donation" },
  { key: "payment_retry_url", label: "رابط إعادة الدفع", sample: "«رابط إعادة الدفع»", category: "donation" },
  { key: "language", label: "اللغة", sample: "«اللغة»", category: "system" },
];

export function sampleVariablesMap() {
  return Object.fromEntries(communicationTemplateVariables.map((item) => [item.key, item.sample]));
}

export function knownVariableKeys() {
  return communicationTemplateVariables.map((item) => item.key);
}
