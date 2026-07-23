import { expect, test } from "@playwright/test";

const sectionSelectors = [
  ".home-hero-v4",
  ".quick-giving-v4",
  ".intent-editorial",
  "#projects",
  ".journey-v4",
  ".pathways-v4",
  ".trust-v4",
  ".knowledge-v4",
  ".final-giving-cta",
];

test.describe("Homepage visual hierarchy", () => {
  test("renders sections in the approved order", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const offsets = [];
    for (const selector of sectionSelectors) {
      const locator = page.locator(selector).first();
      await expect(locator).toBeVisible();
      offsets.push(await locator.evaluate((element) => element.getBoundingClientRect().top + window.scrollY));
    }
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });

  for (const width of [390, 360]) {
    test(`has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.goto("/", { waitUntil: "networkidle" });
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
      expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
    });
  }

  test("keeps quick giving compact and preserves all currencies", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".quick-giving-v4__choices--intent button")).toHaveCount(4);
    await expect(page.locator(".quick-giving-v4__currency option")).toHaveCount(14);
    await expect(page.locator(".quick-giving-v4 fieldset")).toHaveCount(2);
  });

  test("uses one hero primary CTA and the approved message", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".home-hero-v4 h1")).toHaveText("اجعل أثر عطائك واضحًا في القدس والأقصى وغزة");
    await expect(page.locator(".home-hero-v4 .ui-button--primary")).toHaveCount(1);
    await expect(page.locator(".home-hero-v4__secondary")).toHaveCount(1);
  });

  test("contains no unapproved metrics or verification claims", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/145K|20K\+|24\+|تم التحقق|مشاريع ميدانية موثقة/);
  });

  test("keeps mobile content order before the hero image", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    const copyBottom = await page.locator(".home-hero-v4__copy").evaluate((element) => element.getBoundingClientRect().bottom);
    const imageTop = await page.locator(".home-hero-v4__visual").evaluate((element) => element.getBoundingClientRect().top);
    expect(imageTop).toBeGreaterThanOrEqual(copyBottom - 1);
    await expect(page.locator(".home-hero-v4__visual")).toHaveCSS("height", "200px");
  });
});
