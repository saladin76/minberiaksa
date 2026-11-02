import type { ReactNode } from "react";
import MinbarMessages from "./MinbarMessages";
import { LEGACY_NAMESPACES } from "@/i18n/locale-messages";

/** Legacy routes keep their existing translations without shipping this
 * catalog to every homepage, modern project page and donation basket. */
export default function LegacyMessages({ locale, children }: { locale: string; children: ReactNode }) {
  return <MinbarMessages locale={locale} namespaces={LEGACY_NAMESPACES}>{children}</MinbarMessages>;
}
