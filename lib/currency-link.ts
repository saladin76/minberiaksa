import { SUPPORTED_CURRENCY_OPTIONS } from "@/lib/supported-currencies";

/** Stable list for dashboards / link builders (DEFAULT first, then same order as `CurrencySelector`). */
export const URL_CURRENCY_CODES_ORDERED = [
  "DEFAULT",
  ...SUPPORTED_CURRENCY_OPTIONS.map((o) => o.code),
] as const;

/** Matches `CurrencySelector` codes (uppercase in URLs). */
export const ALLOWED_URL_CURRENCIES = new Set<string>(URL_CURRENCY_CODES_ORDERED);

const COOKIE_DEFAULT = "DEFAULT";

/**
 * Cookie "DEFAULT" (site default display) → USD in shared links.
 * Missing cookie → USD.
 */
export function currencyCodeForUrl(cookieValue: string | undefined): string {
  const raw = (cookieValue ?? "").trim();
  if (!raw || raw === COOKIE_DEFAULT) return "USD";
  return raw.toUpperCase();
}

/**
 * Client-only: reads the `currency` cookie from `document.cookie`. Kept in
 * this file (instead of importing `js-cookie`) so the helpers above stay
 * safe to import from the Edge middleware bundle.
 */
export function getCurrencyCodeForLinks(): string {
  if (typeof document === "undefined") return currencyCodeForUrl(undefined);
  const match = document.cookie.match(/(?:^|; )currency=([^;]*)/);
  const raw = match ? decodeURIComponent(match[1]) : undefined;
  return currencyCodeForUrl(raw);
}

export function isValidCurrencyParam(value: string | null | undefined): value is string {
  if (!value) return false;
  return ALLOWED_URL_CURRENCIES.has(value.toUpperCase());
}

/** Persist URL param into the same codes used by `CurrencySelector` / cookies. */
export function normalizeCurrencyParamToCookie(value: string): string {
  const u = value.toUpperCase();
  return ALLOWED_URL_CURRENCIES.has(u) ? u : "USD";
}

export function appendCurrencyQuery(href: string, currency: string): string {
  if (!href) return href;
  const lower = href.toLowerCase();
  if (lower.startsWith("mailto:") || lower.startsWith("tel:") || lower.startsWith("javascript:")) {
    return href;
  }
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    try {
      const u = new URL(href);
      u.searchParams.set("currency", currency);
      return u.toString();
    } catch {
      return href;
    }
  }
  const hashIdx = href.indexOf("#");
  const base = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const hash = hashIdx >= 0 ? href.slice(hashIdx) : "";
  const qIdx = base.indexOf("?");
  const path = qIdx >= 0 ? base.slice(0, qIdx) : base;
  const qs = qIdx >= 0 ? base.slice(qIdx + 1) : "";
  const params = new URLSearchParams(qs);
  params.set("currency", currency);
  const q = params.toString();
  return `${path}?${q}${hash}`;
}

export function mergeCurrencyIntoHref(
  href: string | Record<string, unknown>,
  currency: string
): string | Record<string, unknown> {
  if (typeof href === "string") return appendCurrencyQuery(href, currency);
  const o = href as Record<string, unknown>;
  const q = o.query;
  const nextQuery =
    typeof q === "object" && q !== null && !Array.isArray(q)
      ? { ...(q as Record<string, unknown>), currency }
      : { currency };
  return { ...o, query: nextQuery };
}
