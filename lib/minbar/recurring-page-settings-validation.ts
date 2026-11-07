import { z } from "zod";
import { SUPPORTED_CURRENCY_CODES } from "../supported-currencies";
import { DEFAULT_RECURRING_PAGE_SETTINGS, type RecurringPageSettings } from "./recurring-page-settings";

const amounts = z.array(z.number().finite().positive()).min(1, "أدخل مبلغًا مقترحًا واحدًا على الأقل").refine(values => new Set(values).size === values.length, "احذف المبالغ المكررة");
export const recurringPageSettingsSchema = z.object({
  amounts,
  byCurrency: z.record(amounts).refine(value => Object.keys(value).every(code => SUPPORTED_CURRENCY_CODES.includes(code)), "اختر عملة مدعومة للمبالغ المقترحة"),
  projectMode: z.enum(["AUTO", "SELECTED"]),
  projectIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i).transform(id => id.toLowerCase())).refine(ids => new Set(ids).size === ids.length, "المشروع مكرر في القائمة"),
}).strict().superRefine((value, context) => {
  if (value.projectMode === "SELECTED" && !value.projectIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["projectIds"], message: "اختر مشروعًا منشورًا واحدًا على الأقل" });
});

export function parseRecurringPageSettings(value: unknown): RecurringPageSettings {
  if (value == null) return structuredClone(DEFAULT_RECURRING_PAGE_SETTINGS);
  const parsed = recurringPageSettingsSchema.safeParse(value);
  if (!parsed.success) throw new Error("RECURRING_PAGE_SETTINGS_INVALID");
  return parsed.data;
}
