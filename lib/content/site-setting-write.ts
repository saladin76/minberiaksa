/**
 * Shaping for the site-settings endpoints.
 *
 * Unlike the other content models this is not a list of rows with an order and
 * translations; it is a key → JSON map. A key is upserted, never "created" —
 * the dashboard does not care whether `contact.phone` existed before — and the
 * value is whatever JSON the editor gives it, because the point of `Json` here
 * is that a new setting does not need a schema change.
 */

import { str } from "./translation-write";

/**
 * Keys are dotted lower-case paths: `contact.phone`, `social.instagram`.
 * The shape is enforced so a key typed as "Contact Phone" in one place and
 * "contact_phone" in another cannot become two settings for one thing.
 */
const KEY = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export function isSettingKey(v: unknown): v is string {
  return typeof v === "string" && KEY.test(v) && v.length <= 80;
}

/** The group is a section heading in the dashboard; optional, short, trimmed. */
export function settingGroup(v: unknown): string | undefined {
  const s = str(v);
  return s ? s.slice(0, 40) : undefined;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/**
 * Anything JSON can express is a valid value. `undefined` is not JSON and is
 * refused so that "value missing from the body" cannot silently become null.
 */
export function isJsonValue(v: unknown): v is JsonValue {
  if (v === null) return true;
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return t !== "number" || Number.isFinite(v as number);
  if (Array.isArray(v)) return v.every(isJsonValue);
  if (t === "object") return Object.values(v as Record<string, unknown>).every(isJsonValue);
  return false;
}
