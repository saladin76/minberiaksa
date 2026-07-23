import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const commit = process.env.COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local-uncommitted";
const output = path.resolve("artifacts/project-cards-qa");
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const captures = [
  ["homepage-1440x1200", "/", 1440, 1200, "#projects"],
  ["homepage-1280x1000", "/", 1280, 1000, "#projects"],
  ["homepage-1024x900", "/", 1024, 900, "#projects"],
  ["homepage-390x844", "/", 390, 844, "#projects"],
  ["homepage-360x800", "/", 360, 800, "#projects"],
  ["projects-1440x1200", "/projects", 1440, 1200, ".projects-explorer"],
  ["projects-1280x1000", "/projects", 1280, 1000, ".projects-explorer"],
  ["projects-1024x900", "/projects", 1024, 900, ".projects-explorer"],
  ["projects-768x900", "/projects", 768, 900, ".projects-explorer"],
  ["projects-390x844", "/projects", 390, 844, ".projects-explorer"],
  ["projects-360x800", "/projects", 360, 800, ".projects-explorer"],
];

const report = {
  label: `Local production build screenshots from commit: ${commit}`,
  commit,
  baseURL,
  generatedAt: new Date().toISOString(),
  homepageImageRequests: [],
  captures: [],
};

async function openPage(route, width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: "ar-SA",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const imageRequests = new Set();
  page.on("response", (response) => {
    if (response.request().resourceType() === "image" && response.status() < 400) {
      imageRequests.add(response.url());
    }
  });
  await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return { context, page, imageRequests };
}

for (const [name, route, width, height, target] of captures) {
  const { context, page, imageRequests } = await openPage(route, width, height);
  await page.locator(target).scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(output, filename), fullPage: false, animations: "disabled" });
  const requests = [...imageRequests];
  if (name === "homepage-1440x1200") report.homepageImageRequests = requests;
  report.captures.push({ name, route, width, height, target, filename, imageRequests: requests });
  await context.close();
}

const cardShots = [
  ["card-with-image", "gaza-food-parcels"],
  ["card-fallback", "gaza-hot-meals"],
  ["card-long-title", "al-quds-learning-centres"],
  ["card-short-title", "zakat-for-palestine"],
];

{
  const { context, page } = await openPage("/projects", 1440, 1200);
  for (const [name, slug] of cardShots) {
    const card = page.locator(`[data-project-slug='${slug}']`);
    await card.scrollIntoViewIfNeeded();
    const image = card.locator("img");
    if (await image.count()) {
      await page.waitForFunction((selector) => {
        const element = document.querySelector(selector);
        return element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0;
      }, `[data-project-slug='${slug}'] img`);
    }
    await card.screenshot({ path: path.join(output, `${name}.png`), animations: "disabled" });
  }
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
    const image = await sharp(input).resize(tileWidth, tileHeight, {
      fit: "contain",
      background: "#ffffff",
    }).png().toBuffer();
    composites.push({
      input: image,
      left: gap + (index % columns) * (tileWidth + gap),
      top: gap + Math.floor(index / columns) * (tileHeight + gap),
    });
  }

  await sharp({ create: { width, height, channels: 4, background: "#f7f2ea" } })
    .composite(composites)
    .png()
    .toFile(path.join(output, filename));
}

await contactSheet([
  "homepage-1440x1200",
  "homepage-1280x1000",
  "homepage-1024x900",
  "projects-1440x1200",
  "projects-1280x1000",
  "projects-1024x900",
  "projects-768x900",
], 2, 520, 410, "desktop-contact-sheet.png");

await contactSheet([
  "homepage-390x844",
  "homepage-360x800",
  "projects-390x844",
  "projects-360x800",
], 2, 260, 500, "mobile-contact-sheet.png");

await fs.writeFile(path.join(output, "metadata.json"), JSON.stringify(report, null, 2));
await browser.close();
console.log(report.label);
console.log(`Homepage unique image requests: ${report.homepageImageRequests.length}`);
