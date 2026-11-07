/** UI-only review for slide translations. No database writes or schema changes. */
export const SLIDE_LOCALE_FIELDS = ["title", "description", "buttonText"] as const;

type Field = (typeof SLIDE_LOCALE_FIELDS)[number];
type SlideDraft = Record<string, unknown>;

export type SlideTranslationReview = {
  complete: string[];
  missing: string[];
  incomplete: string[];
};

function cleaned(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formField(draft: SlideDraft, field: Field, locale: string): string {
  return cleaned(draft[field + "_" + locale]);
}

/** An empty row means intentional fallback; a partially filled row without a title is invalid. */
export function reviewSlideTranslations(draft: SlideDraft, locales: readonly string[]): SlideTranslationReview {
  const review: SlideTranslationReview = { complete: [], missing: [], incomplete: [] };
  for (const locale of locales) {
    const title = formField(draft, "title", locale);
    const hasOtherText = Boolean(formField(draft, "description", locale) || formField(draft, "buttonText", locale));
    if (title) review.complete.push(locale);
    else if (hasOtherText) review.incomplete.push(locale);
    else review.missing.push(locale);
  }
  return review;
}

type SavedSlide = {
  title?: unknown;
  description?: unknown;
  image?: unknown;
  showButton?: unknown;
  buttonText?: unknown;
  buttonLink?: unknown;
  isActive?: unknown;
  translations?: Array<{ locale: string; title?: unknown; description?: unknown; buttonText?: unknown }>;
};

/**
 * Compare the draft with a fresh GET /api/slides/:id?allTranslations=true.
 * Never assume a successful response to the write means every locale was persisted.
 * A row with all empty fields must be absent (the current API clears it).
 */
export function slidePersistenceIssues(draft: SlideDraft, saved: SavedSlide, locales: readonly string[]): string[] {
  const issues: string[] = [];
  const scalars = ["title", "description", "image", "buttonText", "buttonLink"] as const;
  for (const field of scalars) {
    if (cleaned(draft[field]) !== cleaned(saved[field])) issues.push(field);
  }
  for (const field of ["showButton", "isActive"] as const) {
    if (Boolean(draft[field]) !== Boolean(saved[field])) issues.push(field);
  }

  const rows = new Map((saved.translations ?? []).map((row) => [row.locale, row]));
  for (const locale of locales) {
    const wantedTitle = formField(draft, "title", locale);
    const row = rows.get(locale);
    if (!wantedTitle) {
      if (row) issues.push(locale + ":unexpected");
      continue;
    }
    if (!row) {
      issues.push(locale + ":missing");
      continue;
    }
    for (const field of SLIDE_LOCALE_FIELDS) {
      if (formField(draft, field, locale) !== cleaned(row[field])) issues.push(locale + ":" + field);
    }
  }
  return issues;
}
