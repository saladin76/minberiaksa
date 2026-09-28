import { test, expect } from "@playwright/test";

import { LOCALES, expectPageOk, expectedDir } from "./support/helpers";

/**
 * Every public locale renders its landing page, in the right direction, without falling back to
 * English copy.
 *
 * This is the cheapest guard the site has and it covers the failure that has actually happened here:
 * a locale added to the router before its messages existed, so the page rendered with raw message keys
 * or silently in English. A 200 alone would have passed that.
 */
test.describe("locale smoke", () => {
  for (const locale of LOCALES) {
    test(`${locale} landing page renders`, async ({ page }) => {
      await expectPageOk(page, `/${locale}`);

      /* The routed locale must be the one the document declares - a mismatch means the middleware and
         the layout disagree about who is being served. */
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("dir", expectedDir(locale));

      /* next-intl renders a missing key as the key itself. Nothing on a finished page should look like
         one, and this is how a half-translated locale announces itself. */
      const body = await page.locator("body").innerText();
      expect(body, `${locale} shows raw message keys`).not.toMatch(/\b[a-zA-Z]+(\.[a-zA-Z]+){2,}\b\s*$/m);
      expect(body).not.toContain("MISSING_MESSAGE");
    });
  }

  test("an unknown locale is a 404, not a fallback render", async ({ page }) => {
    /* `assertLocale` calls notFound() for this. Rendering the Arabic site under /zz instead would
       create an infinite set of duplicate URLs for search engines. */
    const response = await page.goto("/zz", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(404);
  });
});
