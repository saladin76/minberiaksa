import { expect, test } from "@playwright/test";

const routes = ["/", "/zakat", "/waqf", "/recurring"];
const heroes = [
  { path: "/", selector: ".homepage-hero" },
  { path: "/zakat", selector: ".z-hero" },
  { path: "/waqf", selector: ".w-hero" },
  { path: "/recurring", selector: ".recurring-hero" },
] as const;

test.describe("Aqsa pattern visual safeguards", () => {
  test("has no horizontal overflow at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
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

  test("each hero has exactly one pattern layer", async ({ page }) => {
    for (const item of heroes) {
      await page.goto(item.path, { waitUntil: "networkidle" });
      const hero = page.locator(item.selector).first();
      await expect(hero).toBeVisible();
      const count = await hero.evaluate((element) => {
        const root = element.closest(".pattern-background") ?? element;
        let layers = root.querySelectorAll(":scope > .pattern-background__ornament, :scope > .golden-identity-pattern").length;
        for (const pseudo of ["::before", "::after"]) {
          const image = getComputedStyle(element, pseudo).backgroundImage;
          if (image.includes("aqsa-white-pattern")) layers += 1;
        }
        return layers;
      });
      expect(count, `${item.path} pattern layer count`).toBe(1);
    }
  });

  test("modern Chromium requests SVG or WebP and not PNG fallback", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("aqsa-white-pattern.")) requested.push(request.url());
    });
    await page.goto("/", { waitUntil: "networkidle" });
    expect(requested.some((url) => url.endsWith(".svg") || url.endsWith(".webp")), requested.join("\n")).toBeTruthy();
    expect(requested.some((url) => url.endsWith(".png")), requested.join("\n")).toBeFalsy();
  });

  test("high-resolution assets are available", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const sizes = await page.evaluate(async () => {
      const load = (src: string) => new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = reject;
        image.src = src;
      });
      return {
        webp: await load("/assets/patterns/aqsa-white-pattern.webp"),
        png: await load("/assets/patterns/aqsa-white-pattern.png"),
        svg: await load("/assets/patterns/aqsa-white-pattern.svg"),
      };
    });
    expect(sizes.webp).toEqual({ width: 2508, height: 2508 });
    expect(sizes.png).toEqual({ width: 2508, height: 2508 });
    expect(sizes.svg).toEqual({ width: 2508, height: 2508 });
  });
});
