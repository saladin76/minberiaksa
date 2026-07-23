import { expect, test } from "@playwright/test";

type FixtureItem = {
  id?: string;
  projectId?: string;
  slug?: string;
  projectTitle: string;
  region?: string;
  intent: "zakat" | "waqf" | "recurring" | "urgent" | "general";
  intentLabel: string;
  donationMode: "one-time" | "recurring" | "gift";
  amount: number;
  currency: string;
  available?: boolean;
  minimumAmount?: number;
  ownerName?: string;
};

const baseItems: FixtureItem[] = [
  {
    id: "qa-zakat",
    projectId: "gaza-food-parcels",
    slug: "gaza-food-parcels",
    projectTitle: "طرود غذائية لأهل غزة",
    region: "غزة",
    intent: "zakat",
    intentLabel: "زكاة",
    donationMode: "one-time",
    amount: 250,
    currency: "USD",
  },
  {
    id: "qa-waqf",
    projectId: "al-quds-home-restoration",
    slug: "al-quds-home-restoration",
    projectTitle: "ترميم منازل القدس",
    region: "القدس",
    intent: "waqf",
    intentLabel: "وقف",
    donationMode: "one-time",
    amount: 500,
    currency: "USD",
    ownerName: "مساهم",
  },
  {
    id: "qa-relief",
    projectId: "gaza-hot-meals",
    slug: "gaza-hot-meals",
    projectTitle: "الوجبات الساخنة في غزة",
    region: "غزة",
    intent: "urgent",
    intentLabel: "إغاثة عاجلة",
    donationMode: "one-time",
    amount: 100,
    currency: "USD",
  },
];

async function openHomepage(page: import("@playwright/test").Page, width = 1440, height = 1000) {
  await page.setViewportSize({ width, height });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator(".basket-trigger").first().waitFor({ state: "visible" });
}

async function addItems(page: import("@playwright/test").Page, items: FixtureItem[]) {
  await page.evaluate((entries) => {
    entries.forEach((detail) => window.dispatchEvent(new CustomEvent("minber:add-to-basket", { detail })));
  }, items);
  await expect.poll(async () => page.locator(".basket-count").first().textContent()).toBe(String(items.length));
}

async function openBasket(page: import("@playwright/test").Page, mobile = false) {
  const selector = mobile ? ".mobile-header-actions .basket-trigger" : ".utility-account-controls .basket-trigger";
  await page.locator(selector).click();
  await expect(page.getByRole("dialog", { name: "سلة العطاء" })).toBeVisible();
}

test.describe("Giving Basket UX", () => {
  test("empty state is calm and suggestions remain exploratory", async ({ page }) => {
    await openHomepage(page);
    await openBasket(page);
    const drawer = page.getByRole("dialog", { name: "سلة العطاء" });
    await expect(drawer.getByText("سلة عطائك فارغة", { exact: true })).toBeVisible();
    await expect(drawer.getByText("اختر مشروعًا أو نية عطاء، وأضفها إلى السلة لمراجعتها قبل المتابعة.", { exact: true })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "استكشف المشاريع" })).toBeVisible();
    const suggestions = drawer.locator(".basket-starting-point");
    await expect(suggestions).toHaveCount(3);
    await expect(drawer.locator(".giving-drawer-summary")).toHaveCount(0);
    await expect(suggestions.getByText(/USD|TRY|SAR|إزالة/)).toHaveCount(0);
  });

  test("filled state uses actual items and separates currency totals", async ({ page }) => {
    await openHomepage(page);
    const mixed = baseItems.map((item, index) => ({ ...item, currency: ["USD", "TRY", "SAR"][index] }));
    await addItems(page, mixed);
    await openBasket(page);
    const drawer = page.getByRole("dialog", { name: "سلة العطاء" });
    await expect(drawer.locator("[data-basket-item]")).toHaveCount(3);
    await expect(drawer.getByText("250 USD", { exact: true })).toBeVisible();
    await expect(drawer.getByText("500 TRY", { exact: true })).toBeVisible();
    await expect(drawer.getByText("100 SAR", { exact: true })).toBeVisible();
    await expect(drawer.getByText("تُعرض كل عملة بصورة مستقلة دون تحويل.", { exact: true })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "متابعة مراجعة العطاء" })).toBeVisible();
  });

  test("amount editing validates understandable input and updates totals", async ({ page }) => {
    await openHomepage(page);
    await addItems(page, [baseItems[0]]);
    await openBasket(page);
    const drawer = page.getByRole("dialog", { name: "سلة العطاء" });
    const input = drawer.getByRole("textbox", { name: /مبلغ طرود غذائية/ });
    await input.fill("abc");
    await expect(drawer.getByRole("alert")).toHaveText("يرجى استخدام أرقام فقط.");
    await expect(drawer.getByRole("link", { name: "متابعة مراجعة العطاء" })).toHaveAttribute("aria-disabled", "true");
    await input.fill("300");
    await input.press("Enter");
    await expect(drawer.getByText("300 USD", { exact: true })).toBeVisible();
  });

  test("removing the final item returns directly to empty state", async ({ page }) => {
    await openHomepage(page);
    await addItems(page, [baseItems[0]]);
    await openBasket(page);
    const drawer = page.getByRole("dialog", { name: "سلة العطاء" });
    await drawer.getByRole("button", { name: /إزالة طرود غذائية/ }).click();
    await expect(drawer.getByText("سلة عطائك فارغة", { exact: true })).toBeVisible();
    await expect(page.locator(".basket-count").first()).toHaveText("0");
  });

  test("unavailable items are distinct and block continuation", async ({ page }) => {
    await openHomepage(page);
    await addItems(page, [{ ...baseItems[2], available: false }]);
    await openBasket(page);
    const drawer = page.getByRole("dialog", { name: "سلة العطاء" });
    await expect(drawer.getByText("هذا المشروع غير متاح حاليًا للعطاء.", { exact: true })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "متابعة مراجعة العطاء" })).toHaveAttribute("aria-disabled", "true");
    await expect(drawer.locator("[data-basket-available='false']")).toHaveCount(1);
  });

  test("all fourteen supported currencies remain visible without conversion", async ({ page }) => {
    const codes = ["USD", "EUR", "GBP", "TRY", "SAR", "AED", "CAD", "AUD", "KWD", "QAR", "BHD", "OMR", "JOD", "MAD"];
    await openHomepage(page);
    await addItems(page, codes.map((currency, index) => ({ ...baseItems[0], id: `currency-${currency}`, projectTitle: `نية ${index + 1}`, amount: index + 1, currency })));
    await openBasket(page);
    const drawer = page.getByRole("dialog", { name: "سلة العطاء" });
    for (const currency of codes) await expect(drawer.locator(".basket-review-summary__totals").getByText(new RegExp(`\\b${currency}$`))).toBeVisible();
    await expect(drawer.locator(".basket-review-summary__totals strong")).toHaveCount(14);
  });

  for (const width of [390, 360]) {
    test(`mobile drawer has no overflow and footer does not cover the last item at ${width}px`, async ({ page }) => {
      await openHomepage(page, width, width === 390 ? 844 : 800);
      await addItems(page, [...baseItems, ...baseItems.map((item, index) => ({ ...item, id: `extra-${index}`, projectTitle: `${item.projectTitle} — متابعة` }))]);
      await openBasket(page, true);
      const drawer = page.getByRole("dialog", { name: "سلة العطاء" });
      const sizes = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      expect(sizes.document).toBeLessThanOrEqual(sizes.viewport + 1);
      expect(sizes.body).toBeLessThanOrEqual(sizes.viewport + 1);
      const body = drawer.locator(".giving-drawer-body");
      await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      const last = await drawer.locator("[data-basket-item]").last().boundingBox();
      const summary = await drawer.locator(".giving-drawer-summary").boundingBox();
      expect(last).not.toBeNull();
      expect(summary).not.toBeNull();
      expect((last?.y ?? 0) + (last?.height ?? 0)).toBeLessThanOrEqual((summary?.y ?? 0) + 1);
      await expect(drawer.getByRole("button", { name: "إغلاق السلة" })).toBeVisible();
    });
  }

  test("basket never uses payment or prototype wording", async ({ page }) => {
    await openHomepage(page);
    await addItems(page, baseItems);
    await openBasket(page);
    const text = await page.getByRole("dialog", { name: "سلة العطاء" }).innerText();
    expect(text).not.toMatch(/Checkout|Payment|Secure Payment|Review Payment|Demo|Preview|Placeholder|Required|ادفع الآن|إتمام الدفع|تأكيد الدفع|تم التبرع/i);
  });
});
