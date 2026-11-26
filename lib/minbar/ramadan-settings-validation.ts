import { z } from "zod";
import { SUPPORTED_CURRENCY_CODES } from "../supported-currencies";
import { DEFAULT_RAMADAN_SETTINGS, type RamadanSettings } from "./ramadan-settings";

const amounts = z.array(z.number().finite().positive()).min(1, "أدخل مبلغًا مقترحًا واحدًا على الأقل").refine(values => new Set(values).size === values.length, "احذف المبالغ المكررة");
const isRealDate = (value: string) => { const d = new Date(value + "T00:00:00Z"); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value; };
export const ramadanSettingsSchema = z.object({
  enabled: z.boolean(),
  hijriYear: z.number().int().min(1440, "سنة هجرية غير صالحة").max(1500, "سنة هجرية غير صالحة"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "أدخل تاريخ 1 رمضان").refine(isRealDate, "أدخل تاريخ 1 رمضان"),
  startConfirmed: z.boolean(),
  amounts,
  byCurrency: z.record(amounts).refine(value => Object.keys(value).every(code => SUPPORTED_CURRENCY_CODES.includes(code)), "اختر عملة مدعومة للمبالغ المقترحة"),
  projectIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i).transform(id => id.toLowerCase())).refine(ids => new Set(ids).size === ids.length, "المشروع مكرر في القائمة"),
  doubleLast10: z.boolean(),
  homeBanner: z.boolean().default(false),
  homeSection: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if (value.enabled && !value.projectIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["projectIds"], message: "اختر مشروعًا منشورًا واحدًا على الأقل قبل تفعيل الخدمة" });
});

export function parseRamadanSettings(value: unknown): RamadanSettings {
  if (value == null) return structuredClone(DEFAULT_RAMADAN_SETTINGS);
  const parsed = ramadanSettingsSchema.safeParse(value);
  if (!parsed.success) throw new Error("RAMADAN_SETTINGS_INVALID");
  return parsed.data;
}
