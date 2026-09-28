import { test, expect } from "@playwright/test";

import { expectPageOk, firstCampaign } from "./support/helpers";

/**
 * The one journey that has to work: a donor picks a project, reaches checkout, and is offered a way to
 * pay.
 *
 * The cart is seeded through `localStorage` rather than by clicking the quick-donate widget, for one
 * reason: the widget's markup is redesigned often and a selector chasing it would fail for reasons
 * that have nothing to do with whether checkout works. The storage keys and schema version ARE a
 * contract (`lib/minbar/cart.ts` versions them deliberately), so seeding them tests the same contract
 * the widget writes against. The widget itself is covered separately, in quick-donate.spec.ts.
 *
 * No payment is submitted. These tests stop at the point where money would move.
 */

const CART_ITEMS_KEY = "mia_cart_items";
const CART_SCHEMA_KEY = "mia_cart_schema";
const CART_COUNT_KEY = "mia_basket";
const CART_SCHEMA_VERSION = 2;

type SeedItem = {
  projectId?: string;
  titleKey?: string;
  typeKey?: string;
  freqKey: "once" | "monthly";
  amount: number;
  currency: string;
};

async function seedCart(page: import("@playwright/test").Page, items: SeedItem[]): Promise<void> {
  /* The page has to be on the origin before its storage can be written. */
  await page.goto("/ar", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([keys, version, payload]) => {
      const [itemsKey, schemaKey, countKey] = keys as string[];
      window.localStorage.setItem(itemsKey, JSON.stringify(payload));
      window.localStorage.setItem(schemaKey, String(version));
      window.localStorage.setItem(countKey, String((payload as unknown[]).length));
    },
    [[CART_ITEMS_KEY, CART_SCHEMA_KEY, CART_COUNT_KEY], CART_SCHEMA_VERSION, items] as const,
  );
}

test.describe("donation checkout", () => {
  test("a one-off donation reaches checkout with its amount intact", async ({ page, request }, testInfo) => {
    const campaign = await firstCampaign(request, testInfo);

    await seedCart(page, [{ projectId: campaign.id, freqKey: "once", amount: 250, currency: "USD" }]);
    await expectPageOk(page, "/ar/checkout");

    /* The amount has to survive the hop from storage to the server-rendered summary. A checkout that
       shows a different figure than the donor chose is the worst possible bug on this page. */
    await expect(page.locator("body")).toContainText(/250/, { timeout: 30_000 });

    /* And there must be something to pay with. An empty checkout is indistinguishable from a broken
       provider configuration unless the page says so. */
    const payControls = page.getByRole("button", { name: /تبرع|ادفع|متابعة|إتمام|donate|pay|continue/i });
    await expect(payControls.first()).toBeVisible({ timeout: 30_000 });
  });

  test("an empty cart says so instead of showing a payable total", async ({ page }) => {
    await page.goto("/ar", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.localStorage.clear());
    await expectPageOk(page, "/ar/checkout");

    const body = await page.locator("body").innerText();
    /* Either an explicit empty state, or a redirect away. What must not happen is a checkout offering
       to charge nothing. */
    const isEmptyState = /فارغ|لا توجد|أضف|empty/i.test(body);
    const leftCheckout = !page.url().includes("/checkout");
    expect(isEmptyState || leftCheckout, "empty cart produced a payable checkout").toBeTruthy();
  });

  test("the cart page renders and reflects a seeded item", async ({ page, request }, testInfo) => {
    const campaign = await firstCampaign(request, testInfo);
    await seedCart(page, [{ projectId: campaign.id, freqKey: "once", amount: 75, currency: "USD" }]);
    await expectPageOk(page, "/ar/cart");
    await expect(page.locator("body")).toContainText(/75/, { timeout: 30_000 });
  });

  test("a project page offers a way to donate", async ({ page, request }, testInfo) => {
    const campaign = await firstCampaign(request, testInfo);
    const path = campaign.slug ? `/ar/projects/${campaign.slug}` : `/ar/campaign/${campaign.id}`;
    await expectPageOk(page, path);
    await expect(
      page.getByRole("button", { name: /تبرع|أضف|donate|add/i }).first().or(page.getByRole("link", { name: /تبرع|donate/i }).first()),
    ).toBeVisible({ timeout: 30_000 });
  });
});
