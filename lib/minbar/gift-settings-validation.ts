import { z } from "zod";
import { GIFT_OCCASIONS } from "../donations/gift-order";
import { DEFAULT_GIFT_SETTINGS, GIFT_PACKAGE_ICONS, type GiftSettings } from "./gift-settings";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "اختر مشروعًا منشورًا لكل هدية").transform(id => id.toLowerCase());
const intentions = z.array(z.enum(GIFT_OCCASIONS)).max(GIFT_OCCASIONS.length).transform(list => [...new Set(list)]);
const text = (max: number, required: string | null) => z.object({
  ar: required ? z.string().trim().min(1, required).max(max) : z.string().trim().max(max),
  en: z.string().trim().max(max).default(""),
  tr: z.string().trim().max(max).default(""),
}).strict();

export const giftSettingsSchema = z.object({
  enabled: z.boolean(),
  amounts: z.array(z.number().finite().positive().max(1_000_000)).max(8, "ثماني قيم مقترحة على الأكثر").refine(values => new Set(values).size === values.length, "احذف القيم المكررة"),
  waqf: z.object({ share: z.boolean(), meter: z.boolean(), intentions }).strict(),
  impactGifts: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    projectId: objectId,
    icon: z.enum(GIFT_PACKAGE_ICONS),
    name: text(60, "اكتب اسم كل هدية بالعربية"),
    note: text(120, null),
    intentions,
  }).strict()).max(12, "اثنتا عشرة هدية على الأكثر").refine(list => new Set(list.map(g => g.id)).size === list.length, "هدية مكررة"),
  openProjectId: objectId.nullable(),
}).strict().superRefine((value, context) => {
  if (!value.enabled) return;
  if (!value.amounts.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["amounts"], message: "أضف قيمة مقترحة واحدة على الأقل قبل تفعيل الصفحة" });
  if (!value.waqf.share && !value.waqf.meter && !value.impactGifts.length && !value.openProjectId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["impactGifts"], message: "أضف هدية واحدة على الأقل قبل تفعيل الصفحة" });
});

/** Reads the stored document. Settings saved before the catalog (projectIds / packages) start from
 *  the defaults, disabled, rather than breaking the page. */
export function parseGiftSettings(value: unknown): GiftSettings {
  if (value == null || typeof value !== "object") return structuredClone(DEFAULT_GIFT_SETTINGS);
  const parsed = giftSettingsSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const legacy = value as Record<string, unknown>;
  if ("projectIds" in legacy || "packages" in legacy) return { ...structuredClone(DEFAULT_GIFT_SETTINGS), amounts: Array.isArray(legacy.amounts) ? legacy.amounts.filter((n): n is number => typeof n === "number" && n > 0).slice(0, 8) : [] };
  throw new Error("GIFT_SETTINGS_INVALID");
}
