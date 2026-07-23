import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const commit = process.env.COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local-uncommitted";
const output = path.resolve("artifacts/homepage-refinement");
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const captures = [
  ["homepage-1440x1200", 1440, 1200, "body"],
  ["homepage-1280x1000", 1280, 1000, "body"],
  ["homepage-1024x900", 1024, 900, "body"],
  ["homepage-390x844", 390, 844, "body"],
  ["homepage-360x800", 360, 800, "body"],
  ["hero-1440", 1440, 900, ".home-hero-v4"],
  ["quick-giving-1440", 1440, 700, ".quick-giving-v4"],
  ["intent-projects-1440", 1440, 1000, ".intent-editorial"],
  ["journey-pathways-1440", 1440, 1100, ".journey-v4"],
  ["trust-knowledge-1440", 1440, 1100, ".trust-v4"],
];

const report = {
  label: `Local production build screenshots from commit: ${commit}`,
  commit,
  generatedAt: new Date().toISOString(),
  captures: [],
};

for (const [name, width, height, selector] of captures) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: "ar-SA",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const target = page.locator(selector).first();
  if (selector !== "body") await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const filename = `${name}.png`;
  if (selector === "body") {
    await page.screenshot({ path: path.join(output, filename), fullPage: false, animations: "disabled" });
  } else {
    await target.screenshot({ path: path.join(output, filename), animations: "disabled" });
  }
  report.captures.push({ name, width, height, selector, filename });
  await context.close();
}

async function contactSheet(names, columns, tileWidth, tileHeight, filename) {
  const gap = 18;
  const rows = Math.ceil(names.length / columns);
  const width = columns * tileWidth + (columns + 1) * gap;
  const height = rows * tileHeight + (rows + 1) * gap;
  const composites = [];
  for (let index = 0; index < names.length; index += 1) {
    const input = path.join(output, `${names[index]}.png`);
    const image = await sharp(input).resize(tileWidth, tileHeight, { fit: "contain", background: "#fffdf8" }).png().toBuffer();
    composites.push({ input: image, left: gap + (index % columns) * (tileWidth + gap), top: gap + Math.floor(index / columns) * (tileHeight + gap) });
  }
  await sharp({ create: { width, height, channels: 4, background: "#f7f2ea" } }).composite(composites).png().toFile(path.join(output, filename));
}

await contactSheet(["homepage-1440x1200", "homepage-1280x1000", "homepage-1024x900"], 3, 360, 300, "desktop-contact-sheet.png");
await contactSheet(["homepage-390x844", "homepage-360x800"], 2, 280, 520, "mobile-contact-sheet.png");
await fs.writeFile(path.join(output, "metadata.json"), JSON.stringify(report, null, 2));
await browser.close();
console.log(report.label);
