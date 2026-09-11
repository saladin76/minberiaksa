/**
 * Shared shaping for the site-content write endpoints.
 *
 * Every content model in this group has the same translation story: Arabic is
 * the master copy on the parent row, and a sibling `*Translation` keyed
 * `@@unique([<parent>Id, locale])` holds the rest. `lib/slides/slide-write.ts`
 * already solved this for one model, and its reasoning applies unchanged here —
 * a form posts every non-Arabic locale at once, so writing them as separate
 * awaited upserts inside an interactive transaction costs ~10 round trips per
 * save and blows Prisma's 5s transaction timeout against this Atlas cluster.
 * Nested writes are atomic on their own and plan as one operation.
 *
 * What is generic is only the parsing and diffing; each model still declares
 * which fields it translates, and each section keeps its own pages and routes.
 */

import { isKnownLocale } from "@/lib/locales";

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Trimmed string, or undefined when absent — for nullable scalar columns. */
export function optionalStr(v: unknown): string | undefined {
  const s = str(v);
  return s || undefined;
}

export function optionalInt(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function intOr(v: unknown, fallback: number): number {
  return optionalInt(v) ?? fallback;
}

/** A `Boolean @default(true)` column: only an explicit `false` turns it off. */
export function boolDefaultTrue(v: unknown): boolean {
  return v !== false;
}

/** Trimmed, de-duplicated locale codes — for `localeFilter` / `locales` arrays. */
export function localeList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const raw of v) {
    const code = str(raw).toLowerCase();
    if (code && isKnownLocale(code)) out.add(code);
  }
  return [...out];
}

/**
 * A YouTube video id from either the bare eleven characters or any of the
 * usual URL shapes. The forms extract before posting, but the API must not
 * depend on that: a direct call or a seed handing over a URL would otherwise
 * store it as the id, and every player on the site would embed a broken URL.
 */
export function youtubeId(v: unknown): string {
  const s = str(v);
  if (!s) return "";
  if (/^[\w-]{11}$/.test(s)) return s;
  const m =
    s.match(/[?&]v=([\w-]{11})/) ||
    s.match(/youtu\.be\/([\w-]{11})/) ||
    s.match(/\/(?:embed|shorts|live)\/([\w-]{11})/);
  return m ? m[1] : s;
}

/** A `DateTime?` column. An empty value means null — "no limit" — not "now". */
export function optionalDate(v: unknown): Date | null | undefined {
  if (v === null) return null;
  if (v === undefined) return undefined;
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export interface ParsedTranslations<T> {
  /** Locales carrying content — created or updated. */
  write: Array<T & { locale: string }>;
  /**
   * Locales the editor explicitly blanked. These must be deleted rather than
   * skipped: skipping leaves the old row in place, so clearing a translation in
   * the form would silently keep publishing the removed text.
   */
  clear: string[];
}

/**
 * Parse `translations` — `{ [locale]: { ...fields } }` — into rows to write and
 * locales to delete.
 *
 * `required` is the field that decides whether a locale has content at all; a
 * locale whose required field is empty counts as cleared. Arabic is always
 * ignored, because it lives on the parent row.
 */
export function parseTranslations<K extends string>(
  translations: unknown,
  fields: { required: K; optional?: readonly K[] }
): ParsedTranslations<Record<K, string>> {
  const write: Array<Record<K, string> & { locale: string }> = [];
  const clear: string[] = [];
  if (!translations || typeof translations !== "object") return { write, clear };

  for (const [locale, raw] of Object.entries(translations as Record<string, unknown>)) {
    if (locale === "ar" || !isKnownLocale(locale)) continue;
    if (!raw || typeof raw !== "object") continue;

    const t = raw as Record<string, unknown>;
    const required = str(t[fields.required]);
    if (!required) {
      clear.push(locale);
      continue;
    }

    /* Built as a plain record and cast once at the end. Assigning through a
       `Record<K, string>` index makes TypeScript widen the target to the union
       of every value type, which `locale` then contradicts. */
    const row: Record<string, string> = { locale, [fields.required]: required };
    for (const key of fields.optional ?? []) row[key] = str(t[key]);
    write.push(row as Record<K, string> & { locale: string });
  }

  return { write, clear };
}

/**
 * Nothing here builds the nested `translations` write itself.
 *
 * A generic builder has to compose the compound-unique key by name
 * (`storyId_locale`), and a computed key widens to an index signature that
 * Prisma's generated input types reject — so it only compiles behind a cast,
 * which throws away exactly the checking that makes these writes safe. Each
 * route therefore spells its own `upsert`/`deleteMany` out with concrete field
 * names, the way `app/api/slides/[id]/route.ts` does, and keeps full type
 * inference. The parsing and diffing above is the part worth sharing.
 */
