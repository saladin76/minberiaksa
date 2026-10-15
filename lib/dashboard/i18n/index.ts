import { cache, createElement, Fragment, type ReactNode } from "react";
import EN from "./generated/en.json";
import TR from "./generated/tr.json";
import PATTERNS from "./generated/patterns.json";

/**
 * Dashboard interface language.
 *
 * The dashboard is written in Arabic, and the Arabic text in the source *is*
 * the message key: `dt("حفظ")` renders "حفظ" in Arabic, and looks the same text
 * up in the English or Turkish catalogue otherwise. A string missing from a
 * catalogue falls back to the Arabic, so an untranslated label shows up as
 * Arabic rather than as a key.
 *
 * Catalogues are edited in `lib/dashboard/i18n/catalog/{en,tr}.json` (keyed by
 * the Arabic) and compiled by `npm run dash-i18n` into `generated/`, keyed by a
 * short hash so the client bundle doesn't carry every Arabic string twice.
 *
 * The language is a cookie, picked in the top bar. Changing it reloads the page,
 * so module-level label tables are evaluated again in the new language.
 *
 * Where the language comes from:
 *  - browser: the cookie, read once when this module loads;
 *  - server components: a per-request store the dashboard layout fills;
 *  - SSR of client components: set by `DashboardLayoutClient` as it renders.
 */

export const DASH_LOCALES = ["ar", "en", "tr"] as const;
export type DashLocale = (typeof DASH_LOCALES)[number];
export const DASH_LOCALE_COOKIE = "dash-locale";

export function parseDashLocale(value: string | null | undefined): DashLocale {
  return value === "en" || value === "tr" ? value : "ar";
}

function readCookieLocale(): DashLocale {
  if (typeof document === "undefined") return "ar";
  const match = document.cookie.match(/(?:^|;\s*)dash-locale=([a-z]+)/);
  return parseDashLocale(match?.[1]);
}

let fallbackLocale: DashLocale = readCookieLocale();

/* `cache` is per request inside server components and a plain call everywhere
   else, where `locale` stays null and the fallback applies. */
const requestStore = cache((): { locale: DashLocale | null } => ({ locale: null }));

/** Set the language for this module instance (client, SSR). */
export function setDashLocale(locale: DashLocale): void {
  fallbackLocale = locale;
}

/** Set the language for the current server-component request. */
export function setDashRequestLocale(locale: DashLocale): void {
  fallbackLocale = locale;
  try {
    requestStore().locale = locale;
  } catch {
    /* outside a request */
  }
}

type RequestCookies = { get(name: string): { value: string } | undefined };
type WorkUnitStorage = { getStore(): { type?: string; cookies?: RequestCookies } | undefined };
let workUnitStorage: WorkUnitStorage | null | undefined;

/**
 * On the server, the cookie of the request being rendered.
 *
 * Next keeps one store per request in an AsyncLocalStorage that every server
 * layer shares (the `.external` module is never bundled per layer). Reading the
 * cookie from it is exact for server components, for the server render of
 * client components and for route handlers alike  unlike a module variable,
 * which two requests rendering at once would overwrite for each other.
 * Loaded through a runtime `require` so the browser bundle never sees it.
 */
function requestCookieLocale(): DashLocale | null {
  if (typeof window !== "undefined") return null;
  if (workUnitStorage === undefined) {
    try {
      // A runtime require the bundler must not follow.
      const nodeRequire = eval("require") as (id: string) => { workUnitAsyncStorage?: WorkUnitStorage };
      workUnitStorage = nodeRequire("next/dist/server/app-render/work-unit-async-storage.external.js").workUnitAsyncStorage ?? null;
    } catch {
      workUnitStorage = null;
    }
  }
  try {
    const store = workUnitStorage?.getStore();
    if (store?.type !== "request" || !store.cookies) return null;
    return parseDashLocale(store.cookies.get(DASH_LOCALE_COOKIE)?.value);
  } catch {
    return null;
  }
}

export function getDashLocale(): DashLocale {
  const fromRequest = requestCookieLocale();
  if (fromRequest) return fromRequest;
  try {
    const stored = requestStore().locale;
    if (stored) return stored;
  } catch {
    /* outside a request */
  }
  return fallbackLocale;
}

/** FNV-1a, base 36  must match `scripts/dashboard-i18n.mjs`. */
export function dashKeyHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const CATALOGS: Record<Exclude<DashLocale, "ar">, Record<string, string>> = { en: EN, tr: TR };

function lookup(core: string): string | undefined {
  const locale = getDashLocale();
  if (locale === "ar") return undefined;
  return CATALOGS[locale][dashKeyHash(core)];
}

function splitSpace(text: string): [string, string, string] {
  const lead = /^\s*/.exec(text)![0];
  if (lead.length === text.length) return [text, "", ""];
  const trail = /\s*$/.exec(text)![0];
  return [lead, text.slice(lead.length, text.length - trail.length), trail];
}

/**
 * Translate a dashboard string. `{0}`, `{1}`… in the text are filled from
 * `params`, so a sentence keeps its word order in every language.
 */
export function dt(text: string, params?: readonly unknown[]): string {
  const [lead, core, trail] = splitSpace(text);
  let out = lookup(core) ?? core;
  if (params) out = out.replace(/\{(\d+)\}/g, (_, i: string) => String(params[Number(i)] ?? ""));
  return lead + out + trail;
}

/** `dt` for JSX children, where a parameter may itself be an element. */
export function dtx(text: string, params: readonly unknown[]): ReactNode {
  if (params.every((p) => p == null || typeof p !== "object")) return dt(text, params);
  const [lead, core, trail] = splitSpace(text);
  const parts = (lookup(core) ?? core).split(/\{(\d+)\}/);
  const nodes: ReactNode[] = [lead];
  parts.forEach((part, i) => {
    nodes.push(i % 2 ? createElement(Fragment, { key: i }, params[Number(part)] as ReactNode) : part);
  });
  nodes.push(trail);
  return nodes;
}

/**
 * A module-level list of labels, translated when an entry is read rather than
 * when the module loads.
 */
export function dtList<T extends readonly string[]>(items: T): T {
  return new Proxy(items, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "string" && typeof prop === "string" && /^\d+$/.test(prop) ? dt(value) : value;
    },
  });
}

/* `anchor` is the pattern's longest fixed text: a cheap `includes` check that
   rules most patterns out before the regex runs. */
type CompiledPattern = { regex: RegExp; anchor: string; en: string; tr: string };
let compiledPatterns: CompiledPattern[] | null = null;

/* `{0} حذف الشارة: {1}` → /^(.+?) حذف الشارة: (.+?)$/, compiled on first use. */
function runtimePatterns(): CompiledPattern[] {
  if (compiledPatterns) return compiledPatterns;
  compiledPatterns = (PATTERNS as [string, string, string][]).map(([ar, en, tr]) => {
    const source = ar
      .split(/(\{\d+\})/)
      .map((part) => (/^\{\d+\}$/.test(part) ? `(?<p${part.slice(1, -1)}>[\\s\\S]+?)` : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("");
    const anchor = ar.split(/\{\d+\}/).reduce((a, b) => (b.trim().length > a.length ? b.trim() : a), "");
    return { regex: new RegExp(`^${source}$`), anchor, en, tr };
  });
  return compiledPatterns;
}

/**
 * Text that arrives at runtime (an API message, a stored label): translated
 * when the whole string is a known dashboard phrase, or fits one of the
 * templated phrases (`{0} محادثة`), and returned untouched otherwise.
 */
export function dtMaybe(text: string): string {
  const [lead, core, trail] = splitSpace(text);
  if (!core) return text;
  const found = lookup(core);
  if (found !== undefined) return lead + found + trail;
  const locale = getDashLocale();
  if (locale === "ar") return text;
  for (const pattern of runtimePatterns()) {
    if (!core.includes(pattern.anchor)) continue;
    const match = pattern.regex.exec(core);
    if (!match?.groups) continue;
    const groups = match.groups;
    /* A captured value may itself be a phrase (a status, a channel name). */
    const filled = pattern[locale].replace(/\{(\d+)\}/g, (_, i: string) => {
      const value = groups[`p${i}`] ?? "";
      return lookup(value.trim()) ?? value;
    });
    return lead + filled + trail;
  }
  return text;
}

export function dashDir(): "rtl" | "ltr" {
  return getDashLocale() === "ar" ? "rtl" : "ltr";
}

const INTL_LOCALE: Record<Exclude<DashLocale, "ar">, string> = { en: "en-GB", tr: "tr-TR" };

/** The `Intl` locale for a formatter written as `"ar-EG"`: unchanged in Arabic. */
export function dashIntl(arabicLocale: string): string {
  const locale = getDashLocale();
  return locale === "ar" ? arabicLocale : INTL_LOCALE[locale];
}
