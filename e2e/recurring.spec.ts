import { test, expect } from "@playwright/test";

import { expectPageOk, firstCampaign } from "./support/helpers";

/**
 * A monthly plan must stay monthly all the way to checkout.
 *
 * The specific failure this guards is the one the codebase already has a comment about: the plan's own
 * recurring amount is not always the first payment's, because a donor can add team support once only.
 * If the frequency is lost between the cart and the summary, the donor is set up on the wrong plan and
 * nobody finds out until the second month does not arrive.
 */

const CART_ITEMS_KEY = "mia_cart_items";
const CART_SCHEMA_KEY = "mia_cart_schema";
const CART_COUNT_KEY = "mia_basket";

async function seedMonthly(page: import("@playwright/test").Page, projectId: string, amount: number): Promise<void> {
  await page.goto("/ar", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([itemsKey, schemaKey, countKey, id, value]) => {
      window.localStorage.setItem(
        itemsKey as string,
        JSON.stringify([{ projectId: id, freqKey: "monthly", amount: value, currency: "USD" }]),
      );
      window.localStorage.setItem(schemaKey as string, "2");
      window.localStorage.setItem(countKey as string, "1");
    },
    [CART_ITEMS_KEY, CART_SCHEMA_KEY, CART_COUNT_KEY, projectId, amount] as const,
  );
}

test.describe("recurring donations", () => {
  test("a monthly item is still monthly at checkout", async ({ page, request }, testInfo) => {
    const campaign = await firstCampaign(request, testInfo);
    await seedMonthly(page, campaign.id, 100);
    await expectPageOk(page, "/ar/checkout");

    const body = await page.locator("body").innerText();
    expect(body, "checkout does not present this as a monthly plan").toMatch(/شهري|شهريًا|monthly/i);
    expect(body).toContain("100");
  });

  test("the recurring donation landing page renders in Arabic and English", async ({ page }) => {
    /* Its own page, because it is linked from email and is a common entry point. */
    for (const locale of ["ar", "en"]) {
      await expectPageOk(page, `/${locale}/recurring-donation`);
    }
  });

  test("a signed-out donor is asked to identify themselves rather than silently losing the plan", async ({
    page,
    request,
  }, testInfo) => {
    const campaign = await firstCampaign(request, testInfo);
    await seedMonthly(page, campaign.id, 50);
    await expectPageOk(page, "/ar/checkout");

    /* A recurring plan needs an identity to attach to. Whatever the flow does about that - asks for an
       email, offers sign-in - it must ask, because a monthly plan with no donor cannot be managed or
       cancelled afterwards. */
    const asksForIdentity = await page
      .getByRole("textbox")
      .filter({ hasNot: page.locator("[type=hidden]") })
      .count();
    const offersSignIn = await page.getByRole("link", { name: /دخول|حساب|sign in|account/i }).count();
    expect(asksForIdentity + offersSignIn, "no way to identify the donor for a monthly plan").toBeGreaterThan(0);
  });
});
