import type { ContentKind, ContentRecord, TextValues } from "./contracts";

/** Server-only call contract, never read from public route query parameters. */
export type PublicPreviewDraft = { locale: string; changes: TextValues; settings: ContentRecord; seed?: ContentRecord };

export function applyPublicPreview<T extends object>(input: T, draft?: PublicPreviewDraft): T {
  if (!draft) return input;
  const row = { ...input, ...draft.settings } as ContentRecord;
  const scalar = Object.fromEntries(Object.entries(draft.changes).filter(([key]) => !key.includes(".")));
  if (draft.locale === "ar") Object.assign(row, scalar);
  else {
    const translations = Array.isArray(row.translations) ? row.translations as ContentRecord[] : [];
    row.translations = [...translations.filter(entry => entry.locale !== draft.locale), { ...translations.find(entry => entry.locale === draft.locale), locale: draft.locale, ...scalar }];
  }
  return row as T;
}

export function previewText(draft: PublicPreviewDraft | undefined, key: string, fallback: string): string {
  return draft && Object.hasOwn(draft.changes, key) ? draft.changes[key] : fallback;
}

/** Keep removed temporary child text out of the submitted preview snapshot. */
export function previewDraftValues(kind: ContentKind, values: TextValues, settings: ContentRecord): TextValues {
  const groups = kind === "super-categories" ? ["blocks"] : kind === "categories" ? ["values", "infoCards"] : [];
  return Object.fromEntries(Object.entries(values).filter(([key]) => {
    const [group, id] = key.split(".");
    return !id || !groups.includes(group) || !Array.isArray(settings[group]) || (settings[group] as ContentRecord[]).some(child => child.id === id);
  }));
}
