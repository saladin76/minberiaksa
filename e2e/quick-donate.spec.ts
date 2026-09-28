import { test, expect } from "@playwright/test";

import { expectPageOk } from "./support/helpers";

/**
 * The sticky quick-donate widget, which is how most donations on this site start.
 *
 * Covered separately from the checkout journey because it is the one piece of UI that must work on a
 * phone: it is the floating pill and panel, and if it does not open or does not write to the cart, the
 * donation never begins. The checkout tests seed the cart directly so they are not held hostage to this
 * widget's markup; this file is where the widget itself is held to account.
 */
test.describe("quick donate", () => {
  test("the widget is present on the homepage and opens", async ({ page }) => {
    await expectPageOk(page, "/ar");

    /* Found by what it says rather than by class name, so a restyle does not break the test. */
    const opener = page
      .getByRole("button", { name: /تبرع|تبرّع|donate/i })
      .first();
    await expect(opener, "no donate control on the homepage").toBeVisible({ timeout: 30_000 });

    await opener.click();

    /* Once open it must offer an amount to choose. A panel with no amounts is an empty shell. */
    const amountControls = page.getByRole("button", { name: /\d/ });
    await expect(amountControls.first(), "quick donate opened with no amounts").toBeVisible({ timeout: 15_000 });
  });

  test("choosing an amount records something in the cart", async ({ page }) => {
    await expectPageOk(page, "/ar");
    await page.evaluate(() => window.localStorage.clear());

    const opener = page.getByRole("button", { name: /تبرع|تبرّع|donate/i }).first();
    await opener.click();

    const amount = page.getByRole("button", { name: /\d/ }).first();
    await amount.click();

    /* Then whatever the confirm control is called, press it. */
    const confirm = page.getByRole("button", { name: /أضف|تبرع|متابعة|إتمام|add|donate|continue/i }).last();
    await confirm.click().catch(() => undefined);

    /* The contract being checked is the storage the rest of the flow reads: `lib/minbar/cart.ts` keys.
       Either the cart gained an item, or the widget navigated to a page that will collect it. */
    await page.waitForTimeout(1_500);
    const state = await page.evaluate(() => ({
      items: window.localStorage.getItem("mia_cart_items"),
      count: window.localStorage.getItem("mia_basket"),
      url: window.location.pathname,
    }));

    const cartHasItem = Boolean(state.items && state.items !== "[]" && state.items !== "null");
    const movedOn = /\/(cart|checkout)/.test(state.url);
    expect(cartHasItem || movedOn, "picking an amount neither filled the cart nor moved the donor on").toBeTruthy();
  });

  test("the widget survives a locale that is not Arabic", async ({ page }) => {
    await expectPageOk(page, "/en");
    await expect(
      page.getByRole("button", { name: /donate|تبرع/i }).first(),
      "no donate control on the English homepage",
    ).toBeVisible({ timeout: 30_000 });
  });
});
