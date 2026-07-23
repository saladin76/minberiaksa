import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const assetSourceCommit = "d95a28efe87de86c1fc9f2d9b91c397c4edebbf1";
const output = path.resolve("artifacts/pattern-qa");
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const captures = [
  ["homepage-1440x1200", "/", 1440, 1200],
  ["homepage-390x844", "/", 390, 844],
];

const report = { asset_source_commit: assetSourceCommit, baseURL, generatedAt: new Date().toISOString(), captures: [] };
for (const [name, route, width, height] of captures) {
  const context = await browser.newContext({ viewport: { width, height }, locale: "ar-SA", colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  const patternRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("aqsa-white-pattern.")) patternRequests.push(request.url());
  });
  await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(output, filename), fullPage: false, animations: "disabled" });
  report.captures.push({ name, route, width, height, filename, patternRequests });
  await context.close();
}

await fs.writeFile(path.join(output, "metadata.json"), JSON.stringify(report, null, 2));
await browser.close();
console.log(`Local production build screenshots using asset source commit: ${assetSourceCommit}`);
