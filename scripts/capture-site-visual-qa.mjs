import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const commit = process.env.COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local-uncommitted";
const output = path.resolve("artifacts/site-visual-qa");
const screenshotsDir = path.join(output, "screenshots");
await fs.mkdir(screenshotsDir, { recursive: true });

const projectSlugs = [
  "gaza-food-parcels",
  "gaza-hot-meals",
  "gaza-bread",
  "gaza-water",
  "gaza-winter-relief",
  "gaza-iftar",
  "gaza-zakat-al-fitr",
  "al-quds-home-restoration",
  "al-quds-family-relief",
  "al-quds-education-sponsorship",
  "al-quds-learning-centres",
  "al-aqsa-quran-programmes",
  "al-aqsa-lectures-and-pathways",
  "al-quds-young-leaders",
  "al-quds-olive-harvest",
  "al-aqsa-umrah-visit",
  "zakat-for-palestine",
  "waqf-for-al-quds",
  "monthly-palestine-support",
  "syria-emergency-relief",
  "sudan-qurbani",
  "global-qurbani",
];

const mainRoutes = [
  ["home", "/"],
  ["projects", "/projects"],
  ["zakat", "/zakat"],
  ["waqf", "/waqf"],
  ["recurring", "/recurring"],
  ["impact", "/impact"],
  ["knowledge", "/knowledge"],
  ["article-zakat", "/knowledge/estimate-your-zakat"],
  ["about", "/about"],
  ["basket-empty", "/basket"],
  ["checkout-empty", "/checkout"],
  ["sign-in", "/account/sign-in"],
  ["account-overview", "/account"],
  ["account-settings", "/account/settings"],
  ["account-donations", "/account/donations"],
  ["account-recurring", "/account/recurring"],
  ["account-reports", "/account/impact"],
  ["not-found", "/visual-qa-missing-page"],
];

const viewports = [
  { name: "desktop", width: 1440, height: 1000, maxHeadingLines: 3 },
  { name: "mobile-390", width: 390, height: 844, maxHeadingLines: 4 },
  { name: "mobile-360", width: 360, height: 800, maxHeadingLines: 4 },
];

const report = {
  commit,
  generatedAt: new Date().toISOString(),
  baseURL,
  pages: [],
  summary: {},
};

const browser = await chromium.launch({ headless: true });

async function preparePage(context, route) {
  const page = await context.newPage();
  const failedRequests = [];
  page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "request failed" }));
  const response = await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("load", { timeout: 20_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(700);
  return { page, failedRequests, status: response?.status() ?? null };
}

async function populateBasket(page) {
  await page.goto(`${baseURL}/projects/gaza-food-parcels`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(500);
  const addButton = page.getByRole("button", { name: /أضف إلى السلة|أضف إلى سلة التبرعات|أضف إلى سلة العطاء/ }).first();
  if (await addButton.count()) {
    await addButton.click();
    await page.waitForTimeout(350);
  }
}

async function auditPage(page, viewport) {
  return page.evaluate(({ width, maxHeadingLines }) => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const lineCount = (el) => {
      const style = getComputedStyle(el);
      const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
      return Math.max(1, Math.round(el.getBoundingClientRect().height / lineHeight));
    };
    const selector = (el) => {
      if (el.id) return `#${el.id}`;
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
      return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`;
    };

    const horizontalOverflow = document.documentElement.scrollWidth - width;
    const brokenImages = [...document.images].filter((img) => visible(img) && (!img.complete || img.naturalWidth === 0)).map((img) => ({ selector: selector(img), src: img.currentSrc || img.src }));
    const clippedControls = [...document.querySelectorAll("button, a, [role='button']")]
      .filter((el) => visible(el) && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2))
      .map((el) => ({ selector: selector(el), text: el.textContent?.trim().replace(/\s+/g, " ").slice(0, 100), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    const wrappedButtons = [...document.querySelectorAll("button, .button")]
      .filter((el) => visible(el) && (el.textContent?.trim().length ?? 0) > 0 && lineCount(el) > 1)
      .map((el) => ({ selector: selector(el), text: el.textContent?.trim().replace(/\s+/g, " ").slice(0, 100), lines: lineCount(el) }));
    const headingIssues = [...document.querySelectorAll("h1")]
      .filter(visible)
      .map((el) => ({ selector: selector(el), text: el.textContent?.trim().replace(/\s+/g, " "), lines: lineCount(el), fontSize: Number.parseFloat(getComputedStyle(el).fontSize) }))
      .filter((item) => item.lines > maxHeadingLines || item.fontSize > (width >= 1000 ? 76 : 52));
    const emptyLargeSections = [...document.querySelectorAll("main section")]
      .filter(visible)
      .map((el) => ({ selector: selector(el), height: Math.round(el.getBoundingClientRect().height), textLength: (el.textContent?.trim().length ?? 0), media: el.querySelectorAll("img,video,form,input,select,textarea").length }))
      .filter((item) => item.height > window.innerHeight * 1.25 && item.textLength < 90 && item.media === 0);
    const externalPlaceholders = [...document.querySelectorAll("body *")]
      .filter((el) => visible(el) && el.children.length === 0 && /placeholder|stack trace|api error|frontend|backend/i.test(el.textContent ?? ""))
      .map((el) => ({ selector: selector(el), text: el.textContent?.trim().slice(0, 120) }));

    return {
      title: document.title,
      direction: document.documentElement.dir || getComputedStyle(document.body).direction,
      scrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow,
      brokenImages,
      clippedControls,
      wrappedButtons,
      headingIssues,
      emptyLargeSections,
      externalPlaceholders,
    };
  }, viewport);
}

async function captureRoute(routeName, route, viewport, setup) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: "ar-SA",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  let page;
  let failedRequests = [];
  let status = null;
  try {
    if (setup === "basket") {
      page = await context.newPage();
      await populateBasket(page);
      const response = await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded" });
      status = response?.status() ?? null;
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await page.waitForTimeout(700);
    } else {
      ({ page, failedRequests, status } = await preparePage(context, route));
    }
    const audit = await auditPage(page, viewport);
    const viewportFolder = path.join(screenshotsDir, viewport.name);
    await fs.mkdir(viewportFolder, { recursive: true });
    const filename = `${routeName}.png`;
    await page.screenshot({ path: path.join(viewportFolder, filename), fullPage: true, animations: "disabled" });
    report.pages.push({ routeName, route, viewport: viewport.name, width: viewport.width, height: viewport.height, status, screenshot: `screenshots/${viewport.name}/${filename}`, failedRequests, ...audit });
  } catch (error) {
    report.pages.push({ routeName, route, viewport: viewport.name, width: viewport.width, height: viewport.height, error: error instanceof Error ? error.message : String(error) });
  } finally {
    await context.close();
  }
}

for (const viewport of viewports) {
  for (const [name, route] of mainRoutes) await captureRoute(name, route, viewport);
  await captureRoute("basket-populated", "/basket", viewport, "basket");
  await captureRoute("checkout-review", "/checkout", viewport, "basket");
  await captureRoute("checkout-failure", "/checkout/failure", viewport, "basket");
}

for (const viewport of viewports.filter((item) => item.name !== "mobile-360")) {
  for (const slug of projectSlugs) await captureRoute(`project-${slug}`, `/projects/${slug}`, viewport);
}

const critical = report.pages.flatMap((page) => {
  if (page.error) return [{ route: page.route, viewport: page.viewport, type: "capture-error", details: page.error }];
  const issues = [];
  if ((page.horizontalOverflow ?? 0) > 2) issues.push({ route: page.route, viewport: page.viewport, type: "horizontal-overflow", details: page.horizontalOverflow });
  if (page.brokenImages?.length) issues.push({ route: page.route, viewport: page.viewport, type: "broken-images", details: page.brokenImages });
  if (page.clippedControls?.length) issues.push({ route: page.route, viewport: page.viewport, type: "clipped-controls", details: page.clippedControls });
  if (page.headingIssues?.length) issues.push({ route: page.route, viewport: page.viewport, type: "heading", details: page.headingIssues });
  if (page.externalPlaceholders?.length) issues.push({ route: page.route, viewport: page.viewport, type: "technical-placeholder", details: page.externalPlaceholders });
  return issues;
});

report.summary = {
  totalCaptures: report.pages.length,
  criticalIssueCount: critical.length,
  brokenImagePages: report.pages.filter((page) => page.brokenImages?.length).length,
  horizontalOverflowPages: report.pages.filter((page) => (page.horizontalOverflow ?? 0) > 2).length,
  clippedControlPages: report.pages.filter((page) => page.clippedControls?.length).length,
  headingIssuePages: report.pages.filter((page) => page.headingIssues?.length).length,
  wrappedButtonPages: report.pages.filter((page) => page.wrappedButtons?.length).length,
};

await fs.writeFile(path.join(output, "visual-audit.json"), JSON.stringify(report, null, 2));
await fs.writeFile(path.join(output, "critical-issues.json"), JSON.stringify(critical, null, 2));

async function contactSheet(viewportName, routeNames, filename, columns, tileWidth, tileHeight) {
  const gap = 16;
  const available = [];
  for (const routeName of routeNames) {
    const input = path.join(screenshotsDir, viewportName, `${routeName}.png`);
    try { await fs.access(input); available.push({ routeName, input }); } catch {}
  }
  if (!available.length) return;
  const rows = Math.ceil(available.length / columns);
  const width = columns * tileWidth + (columns + 1) * gap;
  const height = rows * tileHeight + (rows + 1) * gap;
  const composites = [];
  for (let index = 0; index < available.length; index += 1) {
    const image = await sharp(available[index].input).resize(tileWidth, tileHeight, { fit: "contain", background: "#ffffff", position: "top" }).png().toBuffer();
    composites.push({ input: image, left: gap + (index % columns) * (tileWidth + gap), top: gap + Math.floor(index / columns) * (tileHeight + gap) });
  }
  await sharp({ create: { width, height, channels: 4, background: "#f3f0e8" } }).composite(composites).png().toFile(path.join(output, filename));
}

const mainNames = [...mainRoutes.map(([name]) => name), "basket-populated", "checkout-review", "checkout-failure"];
await contactSheet("desktop", mainNames, "desktop-main-pages-contact-sheet.png", 4, 320, 260);
await contactSheet("mobile-390", mainNames, "mobile-main-pages-contact-sheet.png", 4, 220, 420);
await contactSheet("desktop", projectSlugs.map((slug) => `project-${slug}`), "desktop-projects-contact-sheet.png", 4, 320, 260);
await contactSheet("mobile-390", projectSlugs.map((slug) => `project-${slug}`), "mobile-projects-contact-sheet.png", 4, 220, 420);

await browser.close();
console.log(JSON.stringify(report.summary));
if (critical.length) process.exitCode = 1;
