"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { TranslationLocale } from "../../../_components/locale-form";
import type { TranslatedLocales } from "../../../_components/AutoTranslateButton";

/**
 * The create-post page keeps every language in memory until the Arabic post
 * is saved, then posts them all at once. This context is that buffer.
 *
 * It also carries the Arabic draft (`arabic`), published by the Arabic editor
 * as it is typed, so a language tab can ask for a machine translation of it
 * before anything exists on the server — and `fillLocales` lets the Arabic
 * tab fill every language in one go. `version` ticks on each bulk fill so the
 * per-locale editors, which hold their own local state, know to re-seed.
 */

export type BufferedLocale = TranslationLocale;

export type LocaleTranslation = {
  title: string;
  description: string;
  content: string | null;
  image: string;
};

export type TranslationsState = Partial<Record<BufferedLocale, LocaleTranslation>>;

export type ArabicDraft = { title: string; description: string; content: string | null };

type Ctx = {
  translations: TranslationsState;
  updateLocale: (loc: BufferedLocale, patch: Partial<LocaleTranslation>) => void;
  arabic: ArabicDraft;
  setArabic: (draft: ArabicDraft) => void;
  /** Write machine translations into the buffer; empty fields only unless `overwrite`. */
  fillLocales: (translations: TranslatedLocales, overwrite: boolean) => void;
  version: number;
};

const CreateTranslationsCtx = createContext<Ctx | null>(null);

const EMPTY: LocaleTranslation = { title: "", description: "", content: null, image: "" };

export function CreateTranslationsProvider({ children }: { children: React.ReactNode }) {
  const [translations, setTranslations] = useState<TranslationsState>({});
  const [arabic, setArabicState] = useState<ArabicDraft>({ title: "", description: "", content: null });
  const [version, setVersion] = useState(0);

  const updateLocale = useCallback((loc: BufferedLocale, patch: Partial<LocaleTranslation>) => {
    setTranslations((prev) => {
      const current = prev[loc] ?? EMPTY;
      const next = { ...current, ...patch };
      const same =
        next.title === current.title &&
        next.description === current.description &&
        next.content === current.content &&
        next.image === current.image;
      if (same) return prev;
      return { ...prev, [loc]: next };
    });
  }, []);

  const setArabic = useCallback((draft: ArabicDraft) => {
    setArabicState((prev) =>
      prev.title === draft.title && prev.description === draft.description && prev.content === draft.content ? prev : draft
    );
  }, []);

  const fillLocales = useCallback((incoming: TranslatedLocales, overwrite: boolean) => {
    setTranslations((prev) => {
      const next: TranslationsState = { ...prev };
      for (const [code, t] of Object.entries(incoming)) {
        const loc = code as BufferedLocale;
        const current = next[loc] ?? EMPTY;
        next[loc] = {
          ...current,
          title: t.fields.title && (overwrite || !current.title.trim()) ? t.fields.title : current.title,
          description:
            t.fields.description && (overwrite || !current.description.trim()) ? t.fields.description : current.description,
          content: t.richFields.content && (overwrite || !current.content) ? t.richFields.content : current.content,
        };
      }
      return next;
    });
    setVersion((v) => v + 1);
  }, []);

  const value = useMemo(
    () => ({ translations, updateLocale, arabic, setArabic, fillLocales, version }),
    [translations, updateLocale, arabic, setArabic, fillLocales, version]
  );
  return <CreateTranslationsCtx.Provider value={value}>{children}</CreateTranslationsCtx.Provider>;
}

export function useCreateTranslations() {
  return useContext(CreateTranslationsCtx);
}
