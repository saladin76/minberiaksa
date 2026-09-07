"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

/**
 * Resolve a navigation-ish label across the three namespaces the handoff's
 * header searches, in the same order:
 *
 *     navigation → common → projects
 *
 * `Header.dc.html` → `Component.tr()` does exactly this, because labels that
 * appear in the nav are often owned by another namespace (`allProjects` lives
 * in `projects`, `zakatCalculator` in `common`). Falling back this way is what
 * keeps a raw key from ever reaching the user.
 *
 * The final fallback is the key itself, but only after all three namespaces
 * miss — which in a complete bundle should not happen.
 */
export function useMinbarLabel() {
  const tNav = useTranslations("navigation");
  const tCommon = useTranslations("common");
  const tProjects = useTranslations("projects");

  return useCallback(
    (key: string): string => {
      if (tNav.has(key)) return tNav(key);
      if (tCommon.has(key)) return tCommon(key);
      if (tProjects.has(key)) return tProjects(key);
      return key;
    },
    [tNav, tCommon, tProjects]
  );
}
