import { ar, enGB, tr, type Locale } from "date-fns/locale";
import { getDashLocale } from "./index";

const DATE_FNS_LOCALES: Record<ReturnType<typeof getDashLocale>, Locale> = { ar, en: enGB, tr };

/** date-fns locale for the dashboard's interface language. */
export function dashDateLocale(): Locale {
  return DATE_FNS_LOCALES[getDashLocale()];
}
