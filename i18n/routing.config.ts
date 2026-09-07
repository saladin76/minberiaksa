import { defineRouting } from "next-intl/routing";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@/lib/locales";

// Locales come from the single source of truth in `lib/locales.ts` (enabled set)
// so the public router never drifts from the rest of the app.
export const routing = defineRouting({
  locales: [...SUPPORTED_LOCALES],
  defaultLocale: DEFAULT_LOCALE,
});
