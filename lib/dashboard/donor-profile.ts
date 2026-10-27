import { z } from "zod";
import { isValidLocale } from "../locales";
import { normalizePhoneE164 } from "../communication/phone";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform(value => value === "" ? null : value);
export const donorProfileSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  phone: optionalText(40).refine(value => !value || (/^[+0-9 ().-]+$/.test(value) && Boolean(normalizePhoneE164(value))), "INVALID_PHONE"),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable().optional(),
  countryName: optionalText(100),
  region: optionalText(100),
  city: optionalText(100),
  gender: z.enum(["male", "female", ""]).nullable().optional(),
  birthdate: optionalText(10).refine(value => {
    if (!value) return true;
    const date = new Date(value + "T00:00:00Z");
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getTime() <= Date.now();
  }, "INVALID_BIRTHDATE"),
  preferredLang: optionalText(8).refine(value => !value || isValidLocale(value), "INVALID_LOCALE"),
  updatedAt: z.string().datetime(),
}).strict();
