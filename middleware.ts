import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import {
  ALLOWED_URL_CURRENCIES,
  normalizeCurrencyParamToCookie,
} from '@/lib/currency-link';
import { currencyForCountry } from '@/lib/geo/country-to-currency';
import { localeForCountry } from '@/lib/geo/country-to-locale';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/lib/locales';
import {
  redirectToLocalizedPath,
  rewriteLocalizedPath,
} from '@/lib/minbar/slug-routing';

// Single source of truth (enabled/public locales) — see `lib/locales.ts`.
const LOCALES = SUPPORTED_LOCALES;
const LOCALE_IN_PATH_RE = new RegExp(`^/(${SUPPORTED_LOCALES.join('|')})(/|$)`);

const intl = createIntlMiddleware({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
});

const CURRENCY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** ISO country code from edge-injected headers (Vercel / Cloudflare). */
function countryFromHeaders(req: NextRequest): string | null {
  const vercel = req.headers.get('x-vercel-ip-country')?.trim().toUpperCase();
  if (vercel && /^[A-Z]{2}$/.test(vercel) && vercel !== 'XX') return vercel;
  const cf = req.headers.get('cf-ipcountry')?.trim().toUpperCase();
  if (cf && /^[A-Z]{2}$/.test(cf) && cf !== 'XX') return cf;
  return null;
}

// Runs before SSR so the page renders with `currency` already in cookies —
// otherwise scripts/pixels would fire with the default (USD) before the
// client-side `?currency=` sync catches up.
export default function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Locale-less URL (e.g. a share link generated with auto-locale): pick a
  // locale from the visitor's country and redirect. URLs that already include
  // a locale prefix are left alone so explicit choices are never overridden.
  if (!LOCALE_IN_PATH_RE.test(pathname)) {
    const country = countryFromHeaders(req);
    const locale = localeForCountry(country) ?? DEFAULT_LOCALE;
    const url = req.nextUrl.clone();
    url.pathname = pathname === '/' ? `/${locale}` : `/${locale}${pathname}`;
    // The redirect target re-enters this middleware and picks up the currency
    // cookie there, so we don't need to set it on the 307 response.
    return NextResponse.redirect(url);
  }

  // Localized slugs (`PRODUCTION_SEO_CONTRACT.md`): the pages live at their
  // canonical slugs in the file tree, so a localized URL is rewritten onto one
  // and the canonical spelling is redirected to the localized URL. Doing the
  // redirect first means only one of the two ever serves a 200.
  const localized = redirectToLocalizedPath(pathname);
  if (localized) {
    const url = req.nextUrl.clone();
    url.pathname = localized;
    return NextResponse.redirect(url, 301);
  }
  const canonical = rewriteLocalizedPath(pathname);
  if (canonical) {
    const url = req.nextUrl.clone();
    url.pathname = canonical;
    return NextResponse.rewrite(url);
  }

  // The 404 boundary renders outside the `[locale]` segment, so it has no
  // route params and next-intl's server APIs are unavailable there. Writing
  // the locale onto the request cookies — the same trick this file already
  // uses for currency — lets it read the locale on the very first request,
  // before next-intl's own response cookie has reached the browser.
  const localeInPath = pathname.match(LOCALE_IN_PATH_RE)?.[1];
  if (localeInPath) req.cookies.set('NEXT_LOCALE', localeInPath);

  const currencyParam = req.nextUrl.searchParams.get('currency');
  let normalized: string | null = null;
  if (currencyParam) {
    const upper = currencyParam.toUpperCase();
    if (ALLOWED_URL_CURRENCIES.has(upper)) {
      normalized = normalizeCurrencyParamToCookie(upper);
      // Update the request cookies so anything that reads cookies() during SSR
      // (e.g. server-side currency helpers) sees the new value immediately.
      req.cookies.set('currency', normalized);
    }
  }

  // First-visit geo detection: when there's no `?currency=` and no existing
  // cookie, pick a currency based on the visitor's country from edge headers.
  // Never overrides an explicit choice (cookie already set or URL param given).
  if (!normalized && !req.cookies.get('currency')) {
    const country = countryFromHeaders(req);
    const geoCurrency = currencyForCountry(country);
    if (geoCurrency) {
      normalized = geoCurrency;
      req.cookies.set('currency', normalized);
    }
  }

  const response = intl(req) ?? NextResponse.next();

  if (normalized) {
    response.cookies.set('currency', normalized, {
      maxAge: CURRENCY_COOKIE_MAX_AGE,
      path: '/',
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  // Catch every public path so locale-less share links also reach the middleware
  // and can be redirected. Excludes: API/Next internals/Vercel internals,
  // the standalone dashboard + auth routes (not localized), and any file with
  // an extension (favicon, images, sitemap.xml, etc.).
  matcher: ['/((?!api|_next|_vercel|dashboard|auth|.*\\..*).*)'],
};
