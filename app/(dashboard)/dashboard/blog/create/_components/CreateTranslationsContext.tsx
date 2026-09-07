"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type BufferedLocale = "en" | "fr" | "tr" | "id" | "pt" | "es" | "de";

export type LocaleTranslation = {
  title: string;
  description: string;
  content: string | null;
  image: string;
};

export type TranslationsState = Partial<Record<BufferedLocale, LocaleTranslation>>;

type Ctx = {
  translations: TranslationsState;
  updateLocale: (loc: BufferedLocale, patch: Partial<LocaleTranslation>) => void;
};

const CreateTranslationsCtx = createContext<Ctx | null>(null);

export function CreateTranslationsProvider({ children }: { children: React.ReactNode }) {
  const [translations, setTranslations] = useState<TranslationsState>({});

  const updateLocale = useCallback((loc: BufferedLocale, patch: Partial<LocaleTranslation>) => {
    setTranslations((prev) => {
      const current = prev[loc] ?? { title: "", description: "", content: null, image: "" };
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

  const value = useMemo(() => ({ translations, updateLocale }), [translations, updateLocale]);
  return <CreateTranslationsCtx.Provider value={value}>{children}</CreateTranslationsCtx.Provider>;
}

export function useCreateTranslations() {
  return useContext(CreateTranslationsCtx);
}
