"use client";

import * as React from "react";
import { IntlLink } from "@/i18n/intl-navigation";
import { getCurrencyCodeForLinks, mergeCurrencyIntoHref } from "@/lib/currency-link";
import { CURRENCY_COOKIE_UPDATED_EVENT } from "@/components/CurrencyFromUrlSync";

/** Re-renders subscribers whenever the currency cookie changes so SSR'd "USD"
 * links refresh as soon as `CurrencyFromUrlSync` (or middleware) settles the
 * real selection. */
function useCurrencyCodeForLinks(): string {
  const [code, setCode] = React.useState<string>(() => getCurrencyCodeForLinks());
  React.useEffect(() => {
    // Hydration: re-read the cookie in case middleware set it before paint.
    setCode(getCurrencyCodeForLinks());
    const onUpdate = () => setCode(getCurrencyCodeForLinks());
    window.addEventListener(CURRENCY_COOKIE_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(CURRENCY_COOKIE_UPDATED_EVENT, onUpdate);
  }, []);
  return code;
}

export const Link = React.forwardRef<
  React.ElementRef<typeof IntlLink>,
  React.ComponentPropsWithoutRef<typeof IntlLink>
>(function Link({ href, ...props }, ref) {
  const code = useCurrencyCodeForLinks();
  const merged = mergeCurrencyIntoHref(
    href as string | Record<string, unknown>,
    code
  ) as React.ComponentPropsWithoutRef<typeof IntlLink>["href"];

  return <IntlLink ref={ref} href={merged} {...props} />;
});

Link.displayName = "Link";
