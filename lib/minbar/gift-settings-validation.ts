import { z } from "zod";
import { DEFAULT_GIFT_SETTINGS, GIFT_PACKAGE_ICONS, type GiftSettings } from "./gift-settings";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "اختر مشروعًا منشورًا لكل خانة").transform(id => id.toLowerCase());
export const giftSettingsSchema = z.object({
  enabled: z.boolean(),
  amounts: z.array(z.number().finite().positive().max(1_000_000)).min(1, "أدخل مبلغًا مقترحًا واحدًا على الأقل").max(8, "ثمانية مبالغ مقترحة على الأكثر").refine(values => new Set(values).size === values.length, "احذف المبالغ المكررة"),
  projectIds: z.array(objectId).max(12, "اثنا عشر مشروعًا على الأكثر").refine(ids => new Set(ids).size === ids.length, "المشروع مكرر في القائمة"),
  packages: z.array(z.object({ projectId: objectId, price: z.number().finite().positive("أدخل سعر كل هدية جاهزة").max(1_000_000), icon: z.enum(GIFT_PACKAGE_ICONS) }).strict()).max(10, "عشر هدايا جاهزة على الأكثر"),
}).strict().superRefine((value, context) => {
  if (value.enabled && !value.projectIds.length && !value.packages.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["projectIds"], message: "اختر مشروعًا أو هدية جاهزة واحدة على الأقل قبل تفعيل الصفحة" });
});

export function parseGiftSettings(value: unknown): GiftSettings {
  if (value == null) return structuredClone(DEFAULT_GIFT_SETTINGS);
  const parsed = giftSettingsSchema.safeParse(value);
  if (!parsed.success) throw new Error("GIFT_SETTINGS_INVALID");
  return parsed.data;
}
