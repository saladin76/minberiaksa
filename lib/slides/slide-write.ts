/**
 * Shared shaping for the hero-slide write endpoints.
 *
 * Why this exists: the slide create/update handlers used to open an interactive
 * `$transaction` and then `await` one `slideTranslation.upsert` per locale
 * inside it. The forms always post all 7 non-Arabic locales, so a single save
 * was ~10 sequential round trips. Against this deployment's Atlas cluster a
 * round trip measures ~0.5s, and an interactive transaction costs ~3s in
 * ceremony alone — so a save took ~10s and regularly blew past Prisma's default
 * 5s interactive-transaction timeout, surfacing as a generic "فشل التحديث".
 *
 * The fix is to stop hand-rolling the transaction: Prisma nested writes are
 * already atomic and are planned as one operation, so `slide.update` with a
 * nested `upsert`/`deleteMany` does the same work in a single round trip.
 */

import { isKnownLocale } from "@/lib/locales";

/** One select shape for every slide read that follows a write. */
export const SLIDE_WITH_TRANSLATIONS_SELECT = {
  id: true,
  title: true,
  description: true,
  image: true,
  showButton: true,
  buttonText: true,
  buttonLink: true,
  isActive: true,
  order: true,
  translations: {
    select: { locale: true, title: true, description: true, buttonText: true },
  },
} as const;

export interface SlideTranslationInput {
  locale: string;
  title: string;
  description: string;
  buttonText: string;
}

export interface ParsedSlideTranslations {
  /** Locales with a title — created or updated. */
  write: SlideTranslationInput[];
  /**
   * Locales the admin explicitly blanked. Previously these were skipped, so
   * clearing a translation in the form silently left the old row in place and
   * the public site kept showing the deleted text.
   */
  clear: string[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * `translations` is `{ [locale]: { title, description, buttonText } }`.
 * Arabic lives on the base model, so an `ar` key is always ignored.
 */
export function parseSlideTranslations(translations: unknown): ParsedSlideTranslations {
  const write: SlideTranslationInput[] = [];
  const clear: string[] = [];
  if (!translations || typeof translations !== "object") return { write, clear };

  for (const [locale, raw] of Object.entries(translations as Record<string, unknown>)) {
    if (locale === "ar" || !isKnownLocale(locale)) continue;
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    const title = str(t.title);
    if (!title) {
      clear.push(locale);
      continue;
    }
    write.push({
      locale,
      title,
      description: str(t.description),
      buttonText: str(t.buttonText),
    });
  }
  return { write, clear };
}

/**
 * Scalar columns for create. Update uses `buildSlideScalarPatch` instead so an
 * omitted field means "leave it alone" rather than "reset it to empty".
 */
export function buildSlideScalars(body: Record<string, unknown>) {
  return {
    title: str(body.title),
    description: str(body.description),
    image: str(body.image),
    showButton: body.showButton !== false,
    buttonText: str(body.buttonText),
    buttonLink: str(body.buttonLink),
    isActive: body.isActive !== false,
    order: typeof body.order === "number" && Number.isFinite(body.order) ? body.order : 0,
  };
}

/**
 * Patch for update: only keys actually present in the body are written.
 *
 * The list page's active-toggle previously had to echo the entire slide back
 * just to flip one boolean, which meant a stray/stale field in the row it held
 * could overwrite good data. With a patch it can send `{ isActive }` alone.
 */
export function buildSlideScalarPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = str(body.title);
  if (body.description !== undefined) patch.description = str(body.description);
  if (body.image !== undefined) patch.image = str(body.image);
  if (body.showButton !== undefined) patch.showButton = body.showButton !== false;
  if (body.buttonText !== undefined) patch.buttonText = str(body.buttonText);
  if (body.buttonLink !== undefined) patch.buttonLink = str(body.buttonLink);
  if (body.isActive !== undefined) patch.isActive = body.isActive !== false;
  if (body.order !== undefined && typeof body.order === "number" && Number.isFinite(body.order)) {
    patch.order = body.order;
  }
  return patch;
}
