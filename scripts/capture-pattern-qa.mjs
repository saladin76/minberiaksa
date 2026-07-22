import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const commit = process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? "local-uncommitted";
const output = path.resolve("artifacts/pattern-qa");
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const captures = [
  ["homepage-1440x1200", "/", 1440, 1200, null],
  ["homepage-390x844", "/", 390, 844, null],
  ["zakat-1440x1200", "/zakat", 1440, 1200, null],
  ["zakat-390x844", "/zakat", 390, 844, null],
  ["waqf-1440x1200", "/waqf", 1440, 1200, null],
  ["waqf-390x844", "/waqf", 390, 844, null],
  ["recurring-1440x1200", "/recurring", 1440, 1200, null],
  ["recurring-390x844", "/recurring", 390, 844, null],
  ["footer-1440x900", "/", 1440, 900, ".site-footer"],
  ["footer-390x700", "/", 390, 700, ".site-footer"],
];

const report = { commit, baseURL, generatedAt: new Date().toISOString(), captures: [] };
for (const [name, route, width, height, target] of captures) {
  const context = await browser.newContext({ viewport: { width, height }, locale: "ar-SA", colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  const patternRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("aqsa-white-pattern.")) patternRequests.push(request.url());
  });
  await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
  if (target) {
    await page.locator(target).scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
  }
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(output, filename), fullPage: false, animations: "disabled" });
  report.captures.push({ name, route, width, height, target, filename, patternRequests });
  await context.close();
}

await fs.writeFile(path.join(output, "metadata.json"), JSON.stringify(report, null, 2));
await browser.close();
console.log(`Local production build screenshots from commit: ${commit}`);
