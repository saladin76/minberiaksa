/**
 * One phone representation for the whole communication stack.
 *
 * The same donor's number was being written and compared in at least three shapes:
 * `+905306516549` when a human typed it, `905306516549` in a Meta webhook (`from` carries no plus),
 * and a digits-only string in the conversation service's own bucket key. Each path picked its own
 * normalisation — digits here, exact string there — so a reply arriving from Meta did not match the
 * outbound delivery it answered, and one contact could split into several conversations.
 *
 * Everything that ingests, stores, sends, matches or buckets a phone number goes through here:
 *
 *  · `normalizePhoneE164` — the canonical form, `+<country><national>`, or null for unusable input.
 *    Storage and comparison both use this.
 *  · `phoneMatchVariants` — the shapes an *existing* row might already hold, so queries still find
 *    data written before this module existed.
 *  · `samePhone` — the comparison, for code holding two values rather than querying.
 *  · `phoneDigits` — the loose, lossy key. Legacy comparison only, never storage.
 *
 * The rules are deliberately deterministic rather than delegated to a parser:
 *
 *  · every source in this system supplies an *international* number (Meta sends E.164 without the
 *    plus; donor records are stored with it), so a plus-less string is treated as international
 *    rather than guessed against a dialling plan;
 *  · `00` is the other international prefix in the wild and becomes `+`;
 *  · a bare national number (leading trunk `0`) cannot be resolved without knowing the country, so
 *    it is left as a stable self-consistent key instead of being guessed into the wrong country.
 *    `libphonenumber-js` has a `defaultCountry` mode for exactly this, but its two-argument form is
 *    version- and bundle-sensitive, and a wrong guess here silently reassigns a conversation to
 *    another person — worse than not resolving it.
 *
 * Validation stays out too: this is a *matching* key. Refusing to store a number a provider is
 * already delivering to would lose the conversation, which is the opposite of the point.
 */

/** Digits only. Loose, lossy, and for legacy comparison only — never for storage. */
export function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** The shortest and longest E.164 subscriber numbers; anything outside is not a phone number. */
const MIN_DIGITS = 7;
const MAX_DIGITS = 15;

/**
 * Canonical `+E.164`, or null when the input cannot be a phone number.
 *
 * Idempotent: normalising an already-canonical number returns it unchanged, which is what lets the
 * same helper run at ingest, at save, at send and at match without drifting.
 */
export function normalizePhoneE164(phone: string | null | undefined): string | null {
  const raw = String(phone ?? "").trim();
  if (!raw) return null;

  /* `00` is the international prefix used across Europe and the Middle East; the plus is the same
     statement. Strip either before counting digits so both shapes land on one key. */
  const withoutPrefix = raw.startsWith("+") ? raw.slice(1) : raw.replace(/^00(?=\d)/, "");
  const digits = phoneDigits(withoutPrefix);
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
  /* A leading zero that survived is a national trunk prefix with no country to resolve it against.
     Kept verbatim: it still compares equal to itself, and it is visibly not an E.164 number rather
     than a plausible-looking number in the wrong country. */
  return `+${digits}`;
}

/**
 * Every shape a stored row might use for this number, for `{ in: [...] }` lookups against data
 * written before normalisation existed: canonical, plus-less, digits, and the raw input.
 * De-duplicated, and empty when the input is unusable.
 */
export function phoneMatchVariants(phone: string | null | undefined): string[] {
  const digits = phoneDigits(phone);
  if (!digits) return [];
  const set = new Set<string>([digits, `+${digits}`]);
  const canonical = normalizePhoneE164(phone);
  if (canonical) {
    set.add(canonical);
    set.add(canonical.slice(1));
  }
  const raw = String(phone ?? "").trim();
  if (raw) set.add(raw);
  return [...set];
}

/** True when two values name the same line, whatever shape each arrived in. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizePhoneE164(a);
  const right = normalizePhoneE164(b);
  if (left && right) return left === right;
  const digitsA = phoneDigits(a);
  const digitsB = phoneDigits(b);
  return digitsA.length > 0 && digitsA === digitsB;
}
