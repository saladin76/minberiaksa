/**
 * Gender + birthdate helpers shared by /dashboard/users, the campaign audience
 * picker, and the APIs behind both, so a filter means the same thing in every
 * place it appears.
 *
 * Both fields are loose strings on `User` (schema.prisma:78-79):
 *  - `gender` is written as "male" / "female" / "preferNotToSay" by the donation
 *    dialog and the guest-donor resolver, but the donor-facing profile page
 *    saves it as free text, so anything can be in there. Normalise on read.
 *  - `birthdate` is an ISO "YYYY-MM-DD" string. That matters: ISO dates sort
 *    lexicographically, so an age range becomes a plain string range query and
 *    needs no computed field or migration.
 */

export type NormalizedGender = "male" | "female" | "undisclosed";

export const GENDER_LABEL_AR: Record<NormalizedGender, string> = {
  male: "ذكر",
  female: "أنثى",
  undisclosed: "غير محدد",
};

const MALE_TOKENS = new Set(["male", "m", "man", "erkek", "ذكر", "رجل"]);
const FEMALE_TOKENS = new Set(["female", "f", "woman", "kadin", "kadın", "أنثى", "انثى", "امرأة", "مراة"]);

/** `null` when nothing usable was stored — distinct from an explicit "prefer not to say". */
export function normalizeGender(value: string | null | undefined): NormalizedGender | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (MALE_TOKENS.has(v)) return "male";
  if (FEMALE_TOKENS.has(v)) return "female";
  // "preferNotToSay" and any other free text the profile page allowed.
  return "undisclosed";
}

/**
 * Parses a `gender` query param. `null` / "" / "all" mean "no filter" — which is
 * why this can't just call `normalizeGender`, since that maps every unrecognised
 * string to "undisclosed" and would turn "all" into a real filter.
 */
export function parseGenderParam(value: string | null | undefined): NormalizedGender | null {
  const v = value?.trim().toLowerCase();
  if (!v || v === "all") return null;
  if (v === "male" || v === "female" || v === "undisclosed") return v;
  return normalizeGender(v);
}

/** The raw values to match in a query for a normalized bucket. */
export function genderQueryValues(g: NormalizedGender): string[] {
  if (g === "male") return [...MALE_TOKENS];
  if (g === "female") return [...FEMALE_TOKENS];
  return ["preferNotToSay", "prefernottosay", "other", "unspecified"];
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseBirthdate(value: string | null | undefined): { year: number; month: number; day: number } | null {
  const m = value?.trim().match(ISO_DATE);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2200) return null;
  return { year, month, day };
}

/** Whole years elapsed, or null when the stored value isn't a usable date. */
export function ageFromBirthdate(value: string | null | undefined, today = new Date()): number | null {
  const b = parseBirthdate(value);
  if (!b) return null;
  const y = today.getUTCFullYear();
  const mo = today.getUTCMonth() + 1;
  const d = today.getUTCDate();
  let age = y - b.year;
  // Birthday not reached yet this year.
  if (mo < b.month || (mo === b.month && d < b.day)) age -= 1;
  return age >= 0 && age <= 130 ? age : null;
}

function isoShift(today: Date, yearsBack: number, daysForward = 0): string {
  const d = new Date(Date.UTC(today.getUTCFullYear() - yearsBack, today.getUTCMonth(), today.getUTCDate() + daysForward));
  return d.toISOString().slice(0, 10);
}

/**
 * Translate an age range into a birthdate string range.
 *
 *   age >= minAge  <=>  birthdate <= today - minAge years
 *   age <= maxAge  <=>  birthdate >= today - (maxAge + 1) years + 1 day
 *
 * Returns `null` when neither bound is set, so callers can skip the clause.
 */
export function birthdateRangeForAges(
  minAge: number | null,
  maxAge: number | null,
  today = new Date()
): { gte?: string; lte?: string } | null {
  const range: { gte?: string; lte?: string } = {};
  if (minAge !== null && Number.isFinite(minAge)) range.lte = isoShift(today, minAge);
  if (maxAge !== null && Number.isFinite(maxAge)) range.gte = isoShift(today, maxAge + 1, 1);
  return range.gte === undefined && range.lte === undefined ? null : range;
}

/** Parses an age query param; rejects nonsense rather than silently clamping to 0. */
export function parseAgeParam(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 130) return null;
  return n;
}

/** "1990-05-04" -> "٤ مايو ١٩٩٠"-style label, kept in Latin digits for table density. */
export function formatBirthdateAr(value: string | null | undefined): string | null {
  const b = parseBirthdate(value);
  if (!b) return null;
  const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  return `${b.day} ${MONTHS[b.month - 1]} ${b.year}`;
}
