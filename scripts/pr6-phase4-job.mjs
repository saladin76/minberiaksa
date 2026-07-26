import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const job = process.env.PHASE4_JOB ?? "smoke";
const sourceCommit = "457dcb1e05e29716aef7b4bb8500d74e953d4ac7";
const root = path.resolve(process.env.PHASE4_OUTPUT ?? `artifacts/phase4/${job}`);
const shots = path.join(root, "screenshots");
await fs.mkdir(shots, { recursive: true });

const report = { job, sourceCommit, generatedAt: new Date().toISOString(), cases: [], summary: {} };
const failures = [];
const browser = await chromium.launch({ headless: true });

const viewportMap = {
  desktop: { width: 1440, height: 900, key: "1440" },
  tablet: { width: 768, height: 1024, key: "768" },
  mobile: { width: 390, height: 844, key: "390" },
  narrow: { width: 360, height: 800, key: "360" },
};

const forbiddenTerms = [
  "REQUIRED", "APPROVED", "PLACEHOLDER", "DOCUMENT", "ASSET", "MEDIA REQUIRED", "PRICE DATA",
  "Demo", "Prototype", "Frontend", "Mock", "Coming soon", "ChatGPT", "Google Drive",
  "SHARIA REVIEW REQUIRED", "OFFICIAL LOGO REQUIRED", "PROJECT FILE REQUIRED",
  "Prototype calculation only", "النموذج التجريبي", "نموذج تجريبي", "تجريبي",
];
const blockedHref = [
  /hesapnumaralarimiz/i, /\/checkout(?:[/?#]|$)/i, /\/account(?:[/?#]|$)/i,
  /\/login(?:[/?#]|$)/i, /\/success(?:[/?#]|$)/i, /\/failure(?:[/?#]|$)/i,
  /\/subscriptions?(?:[/?#]|$)/i, /\/payment(?:[/?#]|$)/i,
];

function cleanName(value) {
  return value.replace(/^\//, "").replace(/[^a-zA-Z0-9_-]+/g, "-") || "home";
}

async function persist() {
  report.summary = {
    totalCases: report.cases.length,
    failures: failures.length,
    passed: failures.length === 0,
  };
  await fs.writeFile(path.join(root, "audit.json"), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(root, "failures.json"), JSON.stringify(failures, null, 2));
}

function fail(scope, message, details = {}) {
  failures.push({ scope, message, ...details });
}

async function addCase(entry) {
  report.cases.push(entry);
  await persist();
}

async function contextFor(viewport) {
  return browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: "ar-SA",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
}

async function go(page, route) {
  const response = await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForFunction(() => document.readyState === "complete" || document.readyState === "interactive", null, { timeout: 5000 }).catch(() => {});
  await page.evaluate(async () => {
    await document.fonts.ready.catch(() => {});
    await Promise.all([...document.images].map((image) => image.decode?.().catch(() => {}) ?? Promise.resolve()));
  }).catch(() => {});
  await page.waitForTimeout(80);
  return response;
}

async function screenshot(page, name, fullPage = false) {
  const file = path.join(shots, `${name}.png`);
  await page.screenshot({ path: file, fullPage, animations: "disabled" });
  return file;
}

async function pageHealth(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    const root = document.documentElement;
    const brokenImages = [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.currentSrc || image.src || image.alt);
    const important = [...document.querySelectorAll("main,header,footer,[data-basket-item],.project-donation-panel,.simple-giving-builder")]
      .filter(visible)
      .map((element) => ({ tag: element.tagName, cls: String(element.className || ""), rect: element.getBoundingClientRect().toJSON() }))
      .filter((item) => item.rect.left < -2 || item.rect.right > innerWidth + 2);
    return {
      overflow: Math.max(0, root.scrollWidth - root.clientWidth, document.body.scrollWidth - root.clientWidth),
      brokenImages,
      clippedImportant: important,
    };
  });
}

async function storedItems(page) {
  return page.evaluate(() => {
    try { return JSON.parse(sessionStorage.getItem("minber-basket-v1") || '{"items":[]}').items || []; }
    catch { return []; }
  });
}

async function waitCount(page, count) {
  await page.waitForFunction((expected) => {
    try { return (JSON.parse(sessionStorage.getItem("minber-basket-v1") || '{"items":[]}').items || []).length === expected; }
    catch { return false; }
  }, count, { timeout: 7000 });
}

async function chooseCurrency(page, code) {
  const trigger = page.locator('[aria-label="اختيار العملة"]:visible').first();
  await trigger.waitFor({ state: "visible", timeout: 5000 });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "اختر العملة" });
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await dialog.getByRole("option", { name: new RegExp(`^${code}\\s*·`) }).click();
  await page.waitForFunction((expected) => [...document.querySelectorAll('[aria-label="اختيار العملة"]')].some((node) => node.textContent?.includes(expected)), code, { timeout: 5000 });
}

async function addProject(page, expectedCount) {
  await go(page, "/projects/gaza-food-parcels");
  const panel = page.locator(".project-donation-panel");
  await panel.getByRole("button", { name: "إضافة التبرع إلى السلة" }).click();
  await waitCount(page, expectedCount);
}

async function addZakat(page, expectedCount) {
  await go(page, "/zakat");
  const builder = page.locator("#zakat-calculator");
  await builder.locator("input").first().fill("10000");
  await builder.locator('.confirm-row input[type="checkbox"]').check();
  await builder.getByRole("button", { name: "إضافة الزكاة إلى السلة" }).click();
  await waitCount(page, expectedCount);
}

async function addWaqf(page, expectedCount) {
  await go(page, "/waqf");
  const builder = page.locator("#waqf-builder");
  await builder.getByLabel("اسم صاحب الوقف").fill("وقف اختبار المرحلة الرابعة");
  await builder.getByRole("button", { name: "إضافة الوقف إلى السلة" }).click();
  await waitCount(page, expectedCount);
}

async function addRecurring(page, expectedCount) {
  await go(page, "/recurring");
  const builder = page.locator("#recurring-plan-builder");
  await builder.getByRole("button", { name: /إضافة إلى السلة/ }).click();
  await waitCount(page, expectedCount);
}

async function discoverProjects(page) {
  await go(page, "/projects");
  const links = await page.locator('a[href^="/projects/"]').evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute("href")).filter(Boolean))]);
  const real = await page.locator("article.project-image-card.has-image a[href^='/projects/']").first().getAttribute("href");
  const fallback = await page.locator("article.project-image-card.no-image a[href^='/projects/']").first().getAttribute("href");
  return { links, real: real ?? links[0], fallback: fallback ?? links.find((link) => link !== real) ?? links[0] };
}

async function runCartCurrency() {
  for (const viewport of Object.values(viewportMap)) {
    const context = await contextFor(viewport);
    const page = await context.newPage();
    const entry = { viewport: viewport.key, states: {}, currencies: {}, health: {}, error: null };
    try {
      await go(page, "/basket");
      entry.states.emptyTitle = await page.getByRole("heading", { name: "سلتك فارغة" }).count() === 1;
      entry.states.emptyText = await page.getByText("اختر مشروعًا وحدد المبلغ، ثم أضفه إلى السلة.", { exact: true }).count() === 1;
      entry.states.noOldText = await page.getByText(/لم تضف أي تبرع/).count() === 0;
      await screenshot(page, `basket-empty-${viewport.key}`, true);

      await go(page, "/");
      await chooseCurrency(page, "USD");
      await addProject(page, 1);
      entry.states.one = (await storedItems(page)).length === 1;
      await go(page, "/basket");
      await screenshot(page, `basket-one-${viewport.key}`, true);

      await chooseCurrency(page, "TRY");
      await addZakat(page, 2);
      await chooseCurrency(page, "EUR");
      await addWaqf(page, 3);
      await go(page, "/basket");
      entry.states.three = (await storedItems(page)).length === 3;
      await screenshot(page, `basket-three-${viewport.key}`, true);

      await chooseCurrency(page, "SAR");
      await addRecurring(page, 4);
      await go(page, "/basket");
      const items = await storedItems(page);
      entry.currencies.itemCodes = items.map((item) => item.currency);
      entry.currencies.expectedOrder = JSON.stringify(entry.currencies.itemCodes) === JSON.stringify(["USD", "TRY", "EUR", "SAR"]);
      entry.currencies.oldItemsPreserved = new Set(entry.currencies.itemCodes).size === 4;
      const totalsText = await page.locator(".basket-review-summary,.giving-drawer-summary,.basket-summary-column").allTextContents();
      entry.currencies.separateTotals = ["USD", "TRY", "EUR", "SAR"].every((code) => totalsText.join(" ").includes(code));
      await screenshot(page, `basket-multi-currency-${viewport.key}`, true);

      const inputs = page.locator("[data-basket-item] input");
      const before = (await storedItems(page))[0]?.amount;
      await inputs.first().fill("");
      await inputs.first().blur();
      await page.waitForTimeout(100);
      entry.states.invalidRejected = (await storedItems(page))[0]?.amount === before && await page.getByRole("alert").count() > 0;
      await inputs.first().fill("175");
      await inputs.first().press("Enter");
      await page.waitForTimeout(120);
      entry.states.validAccepted = (await storedItems(page))[0]?.amount === 175;
      entry.states.validCurrencyPreserved = (await storedItems(page))[0]?.currency === "USD";

      await page.locator("[data-basket-item]").first().getByRole("button", { name: /إزالة/ }).click();
      await page.waitForTimeout(100);
      entry.states.removeOne = await page.locator("[data-basket-item]").count() === 3;
      while (await page.locator("[data-basket-item]").count()) {
        await page.locator("[data-basket-item]").first().getByRole("button", { name: /إزالة/ }).click();
        await page.waitForTimeout(70);
      }
      await page.waitForTimeout(5200);
      entry.states.removeLast = await page.getByRole("heading", { name: "سلتك فارغة" }).count() === 1;
      entry.health = await pageHealth(page);
      await screenshot(page, `basket-after-remove-last-${viewport.key}`, true);
    } catch (error) {
      entry.error = String(error?.stack || error);
      fail("cart-currency", `Flow crashed at ${viewport.key}`, { error: entry.error });
    }
    for (const [name, value] of Object.entries(entry.states)) if (value === false) fail("cart-currency", `${name} failed`, { viewport: viewport.key });
    for (const [name, value] of Object.entries(entry.currencies)) if (typeof value === "boolean" && !value) fail("cart-currency", `${name} failed`, { viewport: viewport.key, itemCodes: entry.currencies.itemCodes });
    if (entry.health.overflow) fail("cart-currency", "Horizontal overflow", { viewport: viewport.key, overflow: entry.health.overflow });
    if (entry.health.brokenImages?.length) fail("cart-currency", "Broken images", { viewport: viewport.key, images: entry.health.brokenImages });
    if (entry.health.clippedImportant?.length) fail("cart-currency", "Important element clipped", { viewport: viewport.key, elements: entry.health.clippedImportant });
    await addCase(entry);
    await context.close();
  }
}

async function runFooterAccessibility() {
  const discoveryContext = await contextFor(viewportMap.mobile);
  const discoveryPage = await discoveryContext.newPage();
  const projects = await discoverProjects(discoveryPage);
  await discoveryContext.close();
  const routes = ["/", "/projects", projects.real, projects.fallback, "/zakat", "/waqf", "/recurring", "/basket", "/about"];
  for (const viewport of [viewportMap.mobile, viewportMap.narrow]) {
    for (const route of routes) {
      const context = await contextFor(viewport);
      const page = await context.newPage();
      const entry = { route, viewport: viewport.key, sections: [], error: null };
      try {
        await go(page, route);
        const footer = page.locator("footer.site-footer");
        entry.footerCount = await footer.count();
        await footer.scrollIntoViewIfNeeded();
        const details = footer.locator("details.footer-link-column");
        entry.closedByDefault = await details.evaluateAll((nodes) => nodes.every((node) => !node.open));
        for (let index = 0; index < await details.count(); index += 1) {
          const detail = details.nth(index);
          const summary = detail.locator("summary");
          const label = (await summary.textContent())?.replace(/\s+/g, " ").trim();
          await summary.focus();
          await page.keyboard.press("Enter");
          const enterOpen = await detail.evaluate((node) => node.open);
          await page.keyboard.press("Enter");
          const enterClose = !(await detail.evaluate((node) => node.open));
          await page.keyboard.press("Space");
          const spaceOpen = await detail.evaluate((node) => node.open);
          await page.keyboard.press("Space");
          const spaceClose = !(await detail.evaluate((node) => node.open));
          entry.sections.push({ label, enterOpen, enterClose, spaceOpen, spaceClose });
        }
        const firstSummary = footer.locator("summary").first();
        await firstSummary.focus();
        entry.focusVisible = await firstSummary.evaluate((node) => {
          const style = getComputedStyle(node);
          return style.outlineStyle !== "none" && style.outlineWidth !== "0px";
        });
        entry.tabOrder = await page.evaluate(() => {
          const summaries = [...document.querySelectorAll("footer.site-footer summary")];
          return summaries.every((node) => node.tabIndex >= 0) && summaries.every((node, index) => index === 0 || node.compareDocumentPosition(summaries[index - 1]) & Node.DOCUMENT_POSITION_PRECEDING);
        });
        entry.health = await pageHealth(page);
        await screenshot(page, `footer-${cleanName(route)}-${viewport.key}`, false);
      } catch (error) {
        entry.error = String(error?.stack || error);
      }
      if (entry.error) fail("footer", "Footer route crashed", { route, viewport: viewport.key, error: entry.error });
      if (entry.footerCount !== 1) fail("footer", "Site footer count is not one", { route, viewport: viewport.key, count: entry.footerCount });
      if (!entry.closedByDefault) fail("footer", "Footer not closed by default", { route, viewport: viewport.key });
      if (!entry.focusVisible) fail("footer", "Summary focus is not visible", { route, viewport: viewport.key });
      if (!entry.tabOrder) fail("footer", "Summary tab order failed", { route, viewport: viewport.key });
      for (const section of entry.sections) if (![section.enterOpen, section.enterClose, section.spaceOpen, section.spaceClose].every(Boolean)) fail("footer", "Native details keyboard behavior failed", { route, viewport: viewport.key, section });
      if (entry.health?.overflow) fail("footer", "Horizontal overflow", { route, viewport: viewport.key, overflow: entry.health.overflow });
      await addCase(entry);
      await context.close();
    }

    const context = await contextFor(viewport);
    const page = await context.newPage();
    const entry = { route: "/phase4-not-found", viewport: viewport.key };
    try {
      const response = await go(page, entry.route);
      entry.status = response?.status();
      entry.compactCount = await page.locator("footer.compact-footer").count();
      entry.siteFooterCount = await page.locator("footer.site-footer").count();
      entry.text = await page.locator("footer.compact-footer").innerText();
      entry.blocked = /الحسابات البنكية|Checkout|تسجيل الدخول|حساب المتبرع/i.test(entry.text);
      entry.health = await pageHealth(page);
      await screenshot(page, `404-compact-footer-${viewport.key}`, true);
    } catch (error) { entry.error = String(error?.stack || error); }
    if (entry.status !== 404 || entry.compactCount !== 1 || entry.siteFooterCount !== 0 || entry.blocked || entry.health?.overflow) fail("footer-404", "Compact footer failed", entry);
    await addCase(entry);
    await context.close();
  }
}

async function runTechnicalLinks() {
  const context = await contextFor(viewportMap.mobile);
  const page = await context.newPage();
  const projects = await discoverProjects(page);
  const routes = ["/", "/projects", ...projects.links, "/zakat", "/waqf", "/recurring", "/impact", "/knowledge", "/about", "/basket", "/phase4-not-found"];
  for (const route of [...new Set(routes)]) {
    const entry = { route };
    try {
      const response = await go(page, route);
      entry.status = response?.status();
      entry.bodyText = await page.locator("body").innerText();
      entry.technicalTerms = forbiddenTerms.filter((term) => entry.bodyText.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
      entry.blockedLinks = await page.locator("a[href]").evaluateAll((nodes, patterns) => nodes.map((node) => ({ text: node.textContent?.replace(/\s+/g, " ").trim(), href: node.getAttribute("href") || "" })).filter((link) => patterns.some((pattern) => new RegExp(pattern, "i").test(link.href))), blockedHref.map((pattern) => pattern.source));
      entry.blockedButtons = await page.locator("button:visible").evaluateAll((nodes) => nodes.map((node) => node.textContent?.replace(/\s+/g, " ").trim()).filter((text) => /Checkout|إتمام الدفع|تسجيل الدخول|إنشاء حساب|حساب المتبرع|إدارة الاشتراكات|وسائل الدفع|الحسابات البنكية/i.test(text || "")));
      entry.languageSelectors = await page.locator('[aria-label^="اختيار اللغة"]:visible').count();
      entry.bankText = /الحسابات البنكية/.test(entry.bodyText);
      entry.health = await pageHealth(page);
      if (entry.technicalTerms.length) fail("technical-text", "Technical text visible", { route, terms: entry.technicalTerms });
      if (entry.blockedLinks.length || entry.blockedButtons.length || entry.bankText) fail("public-links", "Blocked public action visible", { route, links: entry.blockedLinks, buttons: entry.blockedButtons, bankText: entry.bankText });
      if (entry.languageSelectors) fail("language-selector", "Non-functional language selector visible", { route, count: entry.languageSelectors });
      if (entry.health.brokenImages.length) fail("technical-links", "Broken images", { route, images: entry.health.brokenImages });
      if (entry.health.overflow) fail("technical-links", "Horizontal overflow", { route, overflow: entry.health.overflow });
      if (entry.health.clippedImportant.length) fail("technical-links", "Important element clipped", { route, elements: entry.health.clippedImportant });
    } catch (error) {
      entry.error = String(error?.stack || error);
      fail("technical-links", "Route crashed", { route, error: entry.error });
    }
    await addCase(entry);
  }
  await context.close();
}

async function runDonationRegression() {
  const discoveryContext = await contextFor(viewportMap.mobile);
  const discoveryPage = await discoveryContext.newPage();
  const projects = await discoverProjects(discoveryPage);
  await discoveryContext.close();
  const projectRoutes = [projects.real, projects.fallback];
  const absentRoutes = ["/", "/projects", "/zakat", "/waqf", "/recurring", "/basket", "/impact", "/knowledge", "/about", "/phase4-not-found"];
  for (const viewport of [viewportMap.mobile, viewportMap.narrow]) {
    for (const route of projectRoutes) {
      const context = await contextFor(viewport);
      const page = await context.newPage();
      const entry = { route, viewport: viewport.key, expected: "present" };
      try {
        await go(page, route);
        entry.panel = await page.locator(".project-donation-panel").count();
        entry.column = await page.locator(".project-donation-column").count();
        entry.contextualVisible = await page.locator(".contextual-mobile-donate:visible").count();
        entry.mobileLayerVisible = await page.locator(".mobile-donation-layer:visible").count();
        entry.duplicateSticky = await page.locator(".contextual-mobile-donate:visible,.mobile-donation-layer:visible,.sticky-donate-bar:visible").count();
        entry.health = await pageHealth(page);
        await screenshot(page, `donation-project-${cleanName(route)}-${viewport.key}`, true);
      } catch (error) { entry.error = String(error?.stack || error); }
      if (entry.error || entry.panel !== 1 || entry.column !== 1 || entry.contextualVisible !== 0 || entry.mobileLayerVisible !== 0 || entry.duplicateSticky !== 0 || entry.health?.overflow || entry.health?.clippedImportant?.length) fail("donation-regression", "Project donation panel regression", entry);
      await addCase(entry);
      await context.close();
    }
    for (const route of absentRoutes) {
      const context = await contextFor(viewport);
      const page = await context.newPage();
      const entry = { route, viewport: viewport.key, expected: "absent" };
      try {
        await go(page, route);
        entry.tools = await page.locator(".project-donation-panel,.project-donation-column,.contextual-mobile-donate,.mobile-donation-layer").count();
        entry.health = await pageHealth(page);
      } catch (error) { entry.error = String(error?.stack || error); }
      if (entry.error || entry.tools !== 0 || entry.health?.overflow) fail("donation-regression", "Project tool leaked onto public route", entry);
      await addCase(entry);
      await context.close();
    }
  }
}

async function runSmoke() {
  const discoveryContext = await contextFor(viewportMap.mobile);
  const discoveryPage = await discoveryContext.newPage();
  const projects = await discoverProjects(discoveryPage);
  await discoveryContext.close();
  const routes = ["/", "/projects", projects.real, projects.fallback, "/zakat", "/waqf", "/recurring", "/basket", "/phase4-not-found"];
  for (const viewport of [viewportMap.desktop, viewportMap.mobile, viewportMap.narrow]) {
    for (const route of routes) {
      const context = await contextFor(viewport);
      const page = await context.newPage();
      const entry = { route, viewport: viewport.key };
      try {
        const response = await go(page, route);
        entry.status = response?.status();
        entry.health = await pageHealth(page);
        if (route === "/" || route === projects.real || route === projects.fallback || route === "/basket" || route === "/phase4-not-found") await screenshot(page, `smoke-${cleanName(route)}-${viewport.key}`, true);
      } catch (error) { entry.error = String(error?.stack || error); }
      const expected = route === "/phase4-not-found" ? 404 : 200;
      if (entry.error || entry.status !== expected || entry.health?.brokenImages?.length || entry.health?.overflow || entry.health?.clippedImportant?.length) fail("smoke", "Smoke route failed", entry);
      await addCase(entry);
      await context.close();
    }
  }
}

async function contactSheet() {
  const files = (await fs.readdir(shots)).filter((name) => name.endsWith(".png")).sort();
  if (!files.length) return;
  const thumbs = [];
  for (const file of files.slice(0, 36)) {
    const buffer = await sharp(path.join(shots, file)).resize({ width: 320, height: 220, fit: "contain", background: "#ffffff" }).png().toBuffer();
    thumbs.push({ input: buffer, top: Math.floor(thumbs.length / 3) * 230, left: (thumbs.length % 3) * 330 });
  }
  const rows = Math.ceil(thumbs.length / 3);
  await sharp({ create: { width: 980, height: rows * 230, channels: 3, background: "#f5f2ea" } }).composite(thumbs).png().toFile(path.join(root, "contact-sheet.png"));
}

try {
  if (job === "cart-currency") await runCartCurrency();
  else if (job === "footer-accessibility") await runFooterAccessibility();
  else if (job === "technical-links") await runTechnicalLinks();
  else if (job === "donation-regression") await runDonationRegression();
  else if (job === "smoke") await runSmoke();
  else throw new Error(`Unknown PHASE4_JOB: ${job}`);
} finally {
  await persist();
  await contactSheet().catch((error) => fail("contact-sheet", String(error)));
  await persist();
  await browser.close();
}

if (failures.length) process.exitCode = 1;
