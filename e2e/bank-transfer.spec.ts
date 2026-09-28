import { test, expect } from "@playwright/test";

import { expectPageOk } from "./support/helpers";

/**
 * Bank transfer is the payment route with no provider behind it: if the page is wrong, the money goes
 * to the wrong account or nowhere at all, and there is no gateway to catch it.
 *
 * So these tests are about the account details themselves being present and complete, not about the
 * page merely responding.
 */
test.describe("bank transfer", () => {
  test("the bank accounts page shows complete account details", async ({ page }) => {
    await expectPageOk(page, "/ar/bank-accounts");

    const body = await page.locator("body").innerText();

    /* An IBAN is the one field a donor cannot work around. A page listing a bank with no IBAN is worse
       than a page that admits it has none. */
    expect(body, "no IBAN on the bank accounts page").toMatch(/IBAN|آيبان|ايبان/i);

    /* A real IBAN, not a placeholder: two letters, two digits, then at least eleven more characters. */
    const ibanLike = /\b[A-Z]{2}\d{2}[\sA-Z0-9]{11,}\b/;
    expect(body.replace(/‏|‎/g, ""), "no IBAN-shaped value found").toMatch(ibanLike);

    /* And a currency, so a donor knows which account to use. */
    expect(body).toMatch(/TRY|USD|EUR|₺|\$|€|ليرة|دولار|يورو/i);
  });

  test("the bank transfer submission page renders and asks for proof", async ({ page }) => {
    await expectPageOk(page, "/ar/bank-transfer");

    /* The whole point of this flow is that the donor tells us about a transfer we cannot see. It needs
       somewhere to enter it - a form, or an upload for the receipt. */
    const fields = await page.getByRole("textbox").count();
    const uploads = await page.locator('input[type="file"]').count();
    expect(fields + uploads, "bank transfer page collects nothing from the donor").toBeGreaterThan(0);
  });

  test("bank details render in the other public locales too", async ({ page }) => {
    /* Turkish and English donors use the same accounts; a locale that loses the IBAN block is a silent
       dead end for them. */
    for (const locale of ["tr", "en"]) {
      await expectPageOk(page, `/${locale}/bank-accounts`);
      const body = (await page.locator("body").innerText()).replace(/‏|‎/g, "");
      expect(body, `${locale} bank accounts page has no IBAN`).toMatch(/\b[A-Z]{2}\d{2}[\sA-Z0-9]{11,}\b/);
    }
  });
});
