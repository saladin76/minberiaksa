import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const routes = ["/", "/zakat", "/waqf", "/recurring"];
const heroes = [
  { path: "/", selector: ".homepage-hero" },
  { path: "/zakat", selector: ".z-hero" },
  { path: "/waqf", selector: ".w-hero" },
  { path: "/recurring", selector: ".recurring-hero" },
] as const;
const patternPath = "/assets/patterns/aqsa-white-pattern.svg";

async function inspectRaster(file: string) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let maxDifference = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let channel = 0; channel < info.channels; channel += 1) {
      const left = data[(y * info.width) * info.channels + channel];
      const right = data[(y * info.width + info.width - 1) * info.channels + channel];
      maxDifference = Math.max(maxDifference, Math.abs(left - right));
    }
  }
  for (let x = 0; x < info.width; x += 1) {
    for (let channel = 0; channel < info.channels; channel += 1) {
      const top = data[x * info.channels + channel];
      const bottom = data[((info.height - 1) * info.width + x) * info.channels + channel];
      maxDifference = Math.max(maxDifference, Math.abs(top - bottom));
    }
  }
  return { width: info.width, height: info.height, maxDifference };
}

test.describe("Aqsa pattern visual safeguards", () => {
  test("has no horizontal overflow at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of routes) {
      await page.goto(route, { waitUntil: "networkidle" });
      const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      expect.soft(dimensions.document, `${route} document overflow`).toBeLessThanOrEqual(dimensions.viewport + 1);
      expect.soft(dimensions.body, `${route} body overflow`).toBeLessThanOrEqual(dimensions.viewport + 1);
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
          if (getComputedStyle(element, pseudo).backgroundImage.includes("aqsa-white-pattern")) layers += 1;
        }
        return layers;
      });
      expect(count, `${item.path} pattern layer count`).toBe(1);
    }
  });

  test("modern Chromium loads exactly one SVG pattern request", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.includes("aqsa-white-pattern.")) requested.push(pathname);
    });
    await page.goto("/", { waitUntil: "networkidle" });
    expect(requested).toEqual([patternPath]);
  });

  test("assets are high-resolution, vector source is clean, and raster edges are seamless", async () => {
    const root = path.resolve("public/assets/patterns");
    const svg = await fs.readFile(path.join(root, "aqsa-white-pattern.svg"), "utf8");
    expect(svg).toContain('viewBox="0 0 2508 2508"');
    expect(svg).not.toMatch(/<image\b/i);
    const png = await inspectRaster(path.join(root, "aqsa-white-pattern.png"));
    const webp = await inspectRaster(path.join(root, "aqsa-white-pattern.webp"));
    expect(png).toEqual({ width: 2508, height: 2508, maxDifference: 0 });
    expect(webp).toEqual({ width: 2508, height: 2508, maxDifference: 0 });
  });
});
