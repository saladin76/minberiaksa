import { expect, test } from "@playwright/test";

const routes = ["/", "/projects"];

async function waitForCards(page: Parameters<typeof test>[0]["page"]) {
  await page.locator(".project-image-card").first().waitFor({ state: "visible" });
}

test.describe("Project cards visual safeguards", () => {
  for (const width of [390, 360]) {
    test(`has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      for (const path of routes) {
        await page.goto(path, { waitUntil: "networkidle" });
        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        }));
        expect.soft(dimensions.document, `${path} document overflow`).toBeLessThanOrEqual(dimensions.viewport + 1);
        expect.soft(dimensions.body, `${path} body overflow`).toBeLessThanOrEqual(dimensions.viewport + 1);
      }
    });
  }

  test("uses correct project links and two-line titles", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto("/projects", { waitUntil: "networkidle" });
    await waitForCards(page);

    const cards = page.locator(".project-image-card");
    const count = await cards.count();
    expect(count).toBeGreaterThan(5);

    for (let index = 0; index < count; index += 1) {
      const card = cards.nth(index);
      const slug = await card.getAttribute("data-project-slug");
      expect(slug).toBeTruthy();
      await expect(card.locator(".project-image-card__donate")).toHaveAttribute("href", `/projects/${slug}`);
      const titleMetrics = await card.locator("h3").evaluate((element) => {
        const style = getComputedStyle(element);
        return { height: element.getBoundingClientRect().height, lineHeight: Number.parseFloat(style.lineHeight) };
      });
      expect(titleMetrics.height).toBeLessThanOrEqual(titleMetrics.lineHeight * 2 + 2);
    }
  });

  test("keeps cards compact when metrics are absent", async ({ page }) => {
    await page.goto("/projects", { waitUntil: "networkidle" });
    await waitForCards(page);
    await expect(page.locator(".project-image-card__funding")).toHaveCount(0);
    await expect(page.locator(".project-image-card__progress")).toHaveCount(0);
    await expect(page.locator(".project-image-card__donors")).toHaveCount(0);
    await expect(page.locator(".project-image-card[data-has-metrics='true']")).toHaveCount(0);
    const cardText = await page.locator(".projects-cards-grid").innerText();
    expect(cardText).not.toMatch(/تم جمعه|الهدف|مساهمًا/);
  });

  test("bookmark is local UI with accurate pressed state", async ({ page }) => {
    await page.goto("/projects", { waitUntil: "networkidle" });
    const bookmark = page.locator(".project-image-card__bookmark").first();
    await expect(bookmark).toHaveAttribute("aria-pressed", "false");
    await expect(bookmark).toHaveAttribute("aria-label", /حفظ المشروع:/);
    await bookmark.click();
    await expect(bookmark).toHaveAttribute("aria-pressed", "true");
    await expect(bookmark).toHaveAttribute("aria-label", /إزالة المشروع من المحفوظات:/);
  });

  test("mobile hides arrows and desktop shows three complete slides", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("#projects").scrollIntoViewIfNeeded();
    await expect(page.locator(".projects-carousel-controls")).toHaveCSS("display", "none");

    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#projects").scrollIntoViewIfNeeded();
    await expect(page.locator(".projects-carousel-controls")).not.toHaveCSS("display", "none");
    await expect(page.locator(".projects-carousel .swiper-slide-visible")).toHaveCount(3);

    const wrapper = page.locator(".projects-carousel .swiper-wrapper");
    const transformBefore = await wrapper.evaluate((element) => getComputedStyle(element).transform);
    const nextButton = page.locator(".projects-carousel-controls button").last();
    await nextButton.focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => wrapper.evaluate((element) => getComputedStyle(element).transform)).not.toBe(transformBefore);
  });

  test("fallback renders without a broken image", async ({ page }) => {
    await page.goto("/projects", { waitUntil: "networkidle" });
    const fallbackCard = page.locator("[data-project-slug='gaza-hot-meals']");
    await expect(fallbackCard).toBeVisible();
    await expect(fallbackCard.locator(".project-image-card__fallback")).toBeVisible();
    await expect(fallbackCard.locator("img")).toHaveCount(0);
  });

  test("approved field images load or fail gracefully and preserve focal position", async ({ page }) => {
    await page.goto("/projects", { waitUntil: "networkidle" });
    const card = page.locator("[data-project-slug='gaza-food-parcels']");
    const image = card.locator("img");
    await expect.poll(async () => (await image.count()) === 0 || await image.evaluate((element) => (element as HTMLImageElement).complete)).toBeTruthy();
    if (await image.count()) {
      await expect(image).toHaveCSS("object-position", "50% 34%");
      expect(await image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    } else {
      await expect(card.locator(".project-image-card__fallback")).toBeVisible();
    }
  });

  test("contains no prototype wording or unapproved section claim", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("#projects").scrollIntoViewIfNeeded();
    const sectionText = await page.locator("#projects").innerText();
    expect(sectionText).toContain("مشاريع ميدانية متاحة للعطاء");
    expect(sectionText).not.toMatch(/مشاريع ميدانية موثقة|تم التحقق|Demo|Preview|Required|Placeholder/i);
  });
});
