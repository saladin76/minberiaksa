import { AsyncLocalStorage } from "node:async_hooks";
import { dashKeyHash, getDashLocale } from "./i18n";
import EN from "./i18n/generated/en.json";
import TR from "./i18n/generated/tr.json";

const context = new AsyncLocalStorage<"ar" | "en" | "tr">();
export function withReportLanguage<T>(language: string | null | undefined, work: () => T): T {
  const locale = language === "ar" || language === "en" || language === "tr" ? language : context.getStore() ?? getDashLocale();
  return context.run(locale, work);
}
export function dt(text: string, params?: readonly unknown[]): string {
  const locale = context.getStore() ?? getDashLocale();
  const core = text.trim();
  const catalog: Record<string, string> = locale === "tr" ? TR : EN;
  let out = locale === "ar" ? text : text.replace(core, catalog[dashKeyHash(core)] ?? core);
  if (params) out = out.replace(/\{(\d+)\}/g, (_, i: string) => String(params[Number(i)] ?? ""));
  return out;
}
export function dashDir(): "rtl" | "ltr" { return (context.getStore() ?? getDashLocale()) === "ar" ? "rtl" : "ltr"; }
export function dashIntl(arabicLocale: string): string {
  const locale = context.getStore() ?? getDashLocale();
  return locale === "ar" ? arabicLocale : locale === "en" ? "en-GB" : "tr-TR";
}
