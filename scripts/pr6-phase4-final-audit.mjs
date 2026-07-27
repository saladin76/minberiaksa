import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const job = process.env.PHASE4_JOB ?? "smoke";
const root = path.resolve(process.env.PHASE4_OUTPUT ?? `artifacts/phase4/${job}`);
const shots = path.join(root, "screenshots");
await fs.mkdir(shots, { recursive: true });

const audit = { job, commit: process.env.GITHUB_SHA ?? null, generatedAt: new Date().toISOString(), cases: [], summary: {} };
const failures = [];
const browser = await chromium.launch({ headless: true });
const viewports = {
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

async function persist() {
  audit.summary = { totalCases: audit.cases.length, failures: failures.length, passed: failures.length === 0 };
  await fs.writeFile(path.join(root, "audit.json"), JSON.stringify(audit, null, 2));
  await fs.writeFile(path.join(root, "failures.json"), JSON.stringify(failures, null, 2));
}
await persist();

function fail(scope, message, details = {}) { failures.push({ scope, message, ...details }); }
async function addCase(entry) { audit.cases.push(entry); await persist(); }
function clean(value) { return value.replace(/^\//, "").replace(/[^a-zA-Z0-9_-]+/g, "-") || "home"; }

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, locale: "ar-SA", colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(15000);
  const diagnostics = { consoleErrors: [], pageErrors: [], hydrationErrors: [] };
  page.on("console", (message) => {
    const text = message.text();
    if (/hydration|did not match|server rendered html|client rendered/i.test(text)) diagnostics.hydrationErrors.push(text);
    if (message.type() === "error") diagnostics.consoleErrors.push(text);
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(String(error?.stack || error)));
  return { context, page, diagnostics };
}

async function go(page, route) {
  const response = await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.locator("body").waitFor({ state: "attached", timeout: 4000 });
  await page.waitForTimeout(100);
  return response;
}

async function shot(page, name, fullPage = false) {
  const file = path.join(shots, `${name}.png`);
  await page.screenshot({ path: file, fullPage, animations: "disabled" });
  return file;
}

async function health(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    const root = document.documentElement;
    const brokenImages = [...document.images].filter((image) => visible(image) && image.complete && image.naturalWidth === 0).map((image) => image.currentSrc || image.src || image.alt);
    const clipped = [...document.querySelectorAll("main,header,footer,[data-basket-item],.project-donation-panel,.simple-giving-builder")]
      .filter(visible)
      .map((element) => ({ tag: element.tagName, cls: String(element.className || ""), rect: element.getBoundingClientRect().toJSON() }))
      .filter((item) => item.rect.left < -2 || item.rect.right > innerWidth + 2);
    return { overflow: Math.max(0, root.scrollWidth - root.clientWidth, document.body.scrollWidth - root.clientWidth), brokenImages, clipped };
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
  }, count, { timeout: 6000 });
}

async function chooseCurrency(page, code) {
  await go(page, "/");
  const trigger = page.locator('[aria-label^="اختيار العملة"]:visible').first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "اختر العملة" });
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("option", { name: new RegExp(`^${code}\\s*·`) }).click();
  await page.waitForFunction((expected) => [...document.querySelectorAll('[aria-label^="اختيار العملة"]')].some((node) => node.textContent?.includes(expected)), code, { timeout: 5000 });
}

async function addProject(page, count) {
  await go(page, "/projects/gaza-food-parcels");
  await page.locator(".project-donation-panel").getByRole("button", { name: "إضافة التبرع إلى السلة" }).click();
  await waitCount(page, count);
}
async function addZakat(page, count) {
  await go(page, "/zakat");
  const builder = page.locator("#zakat-calculator");
  await builder.locator("input").first().fill("10000");
  await builder.locator('.confirm-row input[type="checkbox"]').check();
  await builder.getByRole("button", { name: "إضافة الزكاة إلى السلة" }).click();
  await waitCount(page, count);
}
async function addWaqf(page, count) {
  await go(page, "/waqf");
  const builder = page.locator("#waqf-builder");
  await builder.getByLabel("اسم صاحب الوقف").fill("وقف اختبار المرحلة الرابعة");
  await builder.getByRole("button", { name: "إضافة الوقف إلى السلة" }).click();
  await waitCount(page, count);
}
async function addRecurring(page, count) {
  await go(page, "/recurring");
  await page.locator("#recurring-plan-builder").getByRole("button", { name: /إضافة إلى السلة/ }).click();
  await waitCount(page, count);
}

async function discoverProjects(page) {
  await go(page, "/projects");
  const linksLocator = page.locator('a[href^="/projects/"]');
  await linksLocator.first().waitFor({ state: "attached" });
  const links = await linksLocator.evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute("href")).filter(Boolean))]);
  const real = await page.locator("article.project-image-card.has-image a[href^='/projects/']").first().getAttribute("href");
  const fallback = await page.locator("article.project-image-card.no-image a[href^='/projects/']").first().getAttribute("href");
  return { links, real: real ?? links[0], fallback: fallback ?? links.find((link) => link !== real) ?? links[0] };
}

function evaluateDiagnostics(entry, diagnostics) {
  const filtered = { ...diagnostics, consoleErrors: diagnostics.consoleErrors.filter((text) => !/^Failed to load resource: the server responded with a status of 404 \(Not Found\)$/.test(text)) };
  entry.console = filtered;
  if (filtered.consoleErrors.length || filtered.pageErrors.length || filtered.hydrationErrors.length) fail(`${job}-console`, "Console or hydration errors", { route: entry.route, viewport: entry.viewport, diagnostics: filtered });
}

async function runCartCurrency() {
  for (const viewport of Object.values(viewports)) {
    const { context, page, diagnostics } = await newPage(viewport);
    const entry = { viewport: viewport.key, states: {}, currencies: {}, error: null };
    try {
      await go(page, "/basket");
      entry.states.emptyTitle = await page.getByRole("heading", { name: "سلتك فارغة" }).count() === 1;
      entry.states.emptyText = await page.getByText("اختر مشروعًا وحدد المبلغ، ثم أضفه إلى السلة.", { exact: true }).count() === 1;
      entry.states.noOldText = await page.getByText(/لم تضف أي تبرع/).count() === 0;
      await shot(page, `basket-empty-${viewport.key}`, true);

      await chooseCurrency(page, "USD"); await addProject(page, 1);
      await chooseCurrency(page, "TRY"); await addZakat(page, 2);
      await chooseCurrency(page, "EUR"); await addWaqf(page, 3);
      await chooseCurrency(page, "SAR"); await addRecurring(page, 4);
      await go(page, "/basket");
      let items = await storedItems(page);
      entry.currencies.itemCodes = items.map((item) => item.currency);
      entry.currencies.expectedOrder = JSON.stringify(entry.currencies.itemCodes) === JSON.stringify(["USD", "TRY", "EUR", "SAR"]);
      const summaryText = (await page.locator("body").innerText());
      entry.currencies.separateTotals = ["USD", "TRY", "EUR", "SAR"].every((code) => summaryText.includes(code));
      await shot(page, `basket-multi-currency-${viewport.key}`, true);

      const inputs = page.locator("[data-basket-item] input");
      const oldCurrency = items[0]?.currency;
      await inputs.first().fill("175"); await inputs.first().press("Enter"); await page.waitForTimeout(150);
      items = await storedItems(page);
      entry.states.editAccepted = items[0]?.amount === 175;
      entry.states.editCurrencyPreserved = items[0]?.currency === oldCurrency;
      await page.locator("[data-basket-item]").first().getByRole("button", { name: /إزالة/ }).click();
      await page.waitForTimeout(150);
      entry.states.removeOne = (await storedItems(page)).length === 3;
      await go(page, "/about"); await go(page, "/basket");
      entry.states.navigationPreserved = JSON.stringify((await storedItems(page)).map((item) => item.currency)) === JSON.stringify(["TRY", "EUR", "SAR"]);
      await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(150);
      entry.states.reloadPreserved = JSON.stringify((await storedItems(page)).map((item) => item.currency)) === JSON.stringify(["TRY", "EUR", "SAR"]);
      entry.health = await health(page);
      await shot(page, `basket-after-edit-remove-${viewport.key}`, true);
    } catch (error) { entry.error = String(error?.stack || error); }
    for (const [name, value] of Object.entries(entry.states)) if (!value) fail("cart-currency", `${name} failed`, { viewport: viewport.key, error: entry.error });
    for (const [name, value] of Object.entries(entry.currencies)) if (typeof value === "boolean" && !value) fail("cart-currency", `${name} failed`, { viewport: viewport.key, itemCodes: entry.currencies.itemCodes });
    if (entry.error) fail("cart-currency", "Flow crashed", { viewport: viewport.key, error: entry.error });
    if (entry.health?.overflow || entry.health?.brokenImages?.length || entry.health?.clipped?.length) fail("cart-currency-health", "Visual health failed", { viewport: viewport.key, health: entry.health });
    evaluateDiagnostics(entry, diagnostics); await addCase(entry); await context.close();
  }

  for (const viewport of [viewports.desktop, viewports.mobile]) {
    const { context, page, diagnostics } = await newPage(viewport);
    const entry = { route: "/", viewport: viewport.key, scope: "quick-giving" };
    try {
      await chooseCurrency(page, "EUR");
      const quick = page.locator(".quick-giving-v4");
      entry.displayCurrency = (await quick.locator('[aria-label^="عملة التبرع"]').innerText()).includes("EUR");
      await quick.getByRole("button", { name: "أضف إلى السلة" }).click(); await waitCount(page, 1);
      entry.itemCurrency = (await storedItems(page))[0]?.currency;
      entry.correctCurrency = entry.itemCurrency === "EUR";
      entry.health = await health(page); await shot(page, `quick-giving-${viewport.key}`);
    } catch (error) { entry.error = String(error?.stack || error); }
    if (entry.error || !entry.displayCurrency || !entry.correctCurrency || entry.health?.overflow) fail("quick-giving", "Quick Giving currency failed", entry);
    evaluateDiagnostics(entry, diagnostics); await addCase(entry); await context.close();
  }
}

async function runFooterAccessibility() {
  const discovery = await newPage(viewports.mobile); const projects = await discoverProjects(discovery.page); await discovery.context.close();
  const routes = ["/", "/projects", projects.real, projects.fallback, "/zakat", "/waqf", "/recurring", "/basket", "/about"];
  for (const viewport of [viewports.mobile, viewports.narrow]) for (const route of routes) {
    const { context, page, diagnostics } = await newPage(viewport); const entry = { route, viewport: viewport.key, sections: [] };
    try {
      await go(page, route); const footer = page.locator("footer.site-footer:visible"); entry.footerCount = await footer.count(); await footer.scrollIntoViewIfNeeded();
      const details = footer.locator("details.footer-link-column"); entry.closedByDefault = await details.evaluateAll((nodes) => nodes.every((node) => !node.open));
      for (let i = 0; i < await details.count(); i++) {
        const detail = details.nth(i); const summary = detail.locator("summary"); const label = (await summary.innerText()).trim();
        await summary.focus(); await page.keyboard.press("Enter"); const enterOpen = await detail.evaluate((node) => node.open);
        await page.keyboard.press("Enter"); const enterClose = !(await detail.evaluate((node) => node.open));
        await page.keyboard.press("Space"); const spaceOpen = await detail.evaluate((node) => node.open);
        await page.keyboard.press("Space"); const spaceClose = !(await detail.evaluate((node) => node.open));
        entry.sections.push({ label, enterOpen, enterClose, spaceOpen, spaceClose });
      }
      const first = footer.locator("summary").first(); await first.focus(); entry.focusVisible = await first.evaluate((node) => { const selectors = [...document.styleSheets].flatMap((sheet) => { try { return [...sheet.cssRules].map((rule) => rule.selectorText || ""); } catch { return []; } }); return node.tabIndex >= 0 && selectors.some((selector) => selector.includes(".footer-link-column summary:focus-visible")); });
      entry.health = await health(page); await shot(page, `footer-${clean(route)}-${viewport.key}`);
    } catch (error) { entry.error = String(error?.stack || error); }
    if (entry.error || entry.footerCount !== 1 || !entry.closedByDefault || !entry.focusVisible || entry.sections.some((s) => ![s.enterOpen,s.enterClose,s.spaceOpen,s.spaceClose].every(Boolean)) || entry.health?.overflow) fail("footer", "Footer keyboard or layout failed", entry);
    evaluateDiagnostics(entry, diagnostics); await addCase(entry); await context.close();
  }
  for (const viewport of [viewports.mobile, viewports.narrow]) {
    const { context, page, diagnostics } = await newPage(viewport); const entry = { route: "/phase4-not-found", viewport: viewport.key };
    try { const response = await go(page, entry.route); entry.status = response?.status(); entry.compactCount = await page.locator("footer.compact-footer").count(); entry.siteFooterCount = await page.locator("footer.site-footer").count(); entry.text = await page.locator("footer.compact-footer").innerText(); entry.blocked = /الحسابات البنكية|Checkout|تسجيل الدخول|حساب المتبرع/i.test(entry.text); entry.health = await health(page); await shot(page, `404-${viewport.key}`, true); } catch (error) { entry.error = String(error?.stack || error); }
    if (entry.error || entry.status !== 404 || entry.compactCount !== 1 || entry.siteFooterCount !== 0 || entry.blocked || entry.health?.overflow) fail("footer-404", "Compact footer failed", entry);
    evaluateDiagnostics(entry, diagnostics); await addCase(entry); await context.close();
  }
}

async function runTechnicalLinks() {
  const { context, page, diagnostics } = await newPage(viewports.mobile); const projects = await discoverProjects(page);
  const routes = [...new Set(["/", "/projects", ...projects.links, "/zakat", "/waqf", "/recurring", "/impact", "/knowledge", "/about", "/basket", "/phase4-not-found"])];
  for (const route of routes) {
    const entry = { route };
    try {
      const response = await go(page, route); entry.status = response?.status(); const bodyText = await page.locator("body").innerText();
      entry.technicalTerms = forbiddenTerms.filter((term) => bodyText.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
      entry.blockedLinks = await page.locator("a[href]").evaluateAll((nodes, patterns) => nodes.map((node) => ({ text: node.textContent?.trim(), href: node.getAttribute("href") || "" })).filter((link) => patterns.some((pattern) => new RegExp(pattern,"i").test(link.href))), blockedHref.map((p) => p.source));
      entry.blockedButtons = await page.locator("button:visible").evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim()).filter((text) => /Checkout|إتمام الدفع|تسجيل الدخول|إنشاء حساب|حساب المتبرع|إدارة الاشتراكات|وسائل الدفع|الحسابات البنكية/i.test(text || "")));
      entry.languageSelectors = await page.locator('[aria-label^="اختيار اللغة"]').count(); entry.bankText = /الحسابات البنكية/.test(bodyText); entry.health = await health(page);
    } catch (error) { entry.error = String(error?.stack || error); }
    if (entry.error || entry.technicalTerms?.length || entry.blockedLinks?.length || entry.blockedButtons?.length || entry.languageSelectors || entry.bankText || entry.health?.brokenImages?.length || entry.health?.overflow || entry.health?.clipped?.length) fail("technical-links", "Technical text, public link, language, or visual failure", entry);
    await addCase(entry);
  }
  const langEntry = { scope: "language-config" };
  const langSource = await fs.readFile(path.resolve("config/languages.ts"), "utf8"); langEntry.localeCount = (langSource.match(/\["[a-z]{2}"/g) ?? []).length;
  const mobileSource = await fs.readFile(path.resolve("components/layout/mobile-navigation.tsx"), "utf8"); const utilitySource = await fs.readFile(path.resolve("components/layout/top-utility-bar.tsx"), "utf8");
  langEntry.emptyLanguageRows = /<span>اللغة<\/span>/.test(mobileSource + utilitySource); if (langEntry.localeCount !== 13 || langEntry.emptyLanguageRows) fail("language-config", "Language configuration or hidden row failed", langEntry);
  const creators = ["components/project-detail/project-donation-panel.tsx","components/zakat/zakat-calculator.tsx","components/waqf/waqf-builder.tsx","components/recurring/recurring-plan-builder.tsx","components/homepage/homepage-interactions.tsx","components/homepage/quick-giving.tsx"];
  langEntry.fixedUsd = []; for (const file of creators) if (/currency:\s*["']USD["']/.test(await fs.readFile(path.resolve(file),"utf8"))) langEntry.fixedUsd.push(file);
  if (langEntry.fixedUsd.length) fail("currency-source", "Fixed USD remains", langEntry); await addCase(langEntry);
  evaluateDiagnostics({ route: "all-routes", viewport: "390" }, diagnostics); await context.close();
}

async function runDonationRegression() {
  const discovery = await newPage(viewports.mobile); const projects = await discoverProjects(discovery.page); await discovery.context.close();
  for (const viewport of [viewports.mobile, viewports.narrow]) {
    for (const route of [projects.real, projects.fallback]) {
      const { context, page, diagnostics } = await newPage(viewport); const entry = { route, viewport: viewport.key, expected: "present" };
      try { await go(page, route); entry.panel = await page.locator(".project-donation-panel:visible").count(); entry.column = await page.locator(".project-donation-column:visible").count(); entry.stickyVisible = await page.locator(".contextual-mobile-donate:visible,.mobile-donation-layer:visible,.sticky-donate-bar:visible").count(); entry.health = await health(page); await shot(page, `project-tool-${clean(route)}-${viewport.key}`, true); } catch (error) { entry.error = String(error?.stack || error); }
      if (entry.error || entry.panel !== 1 || entry.column !== 1 || entry.stickyVisible !== 0 || entry.health?.overflow || entry.health?.clipped?.length) fail("donation-regression", "Project tool present-route failed", entry);
      evaluateDiagnostics(entry, diagnostics); await addCase(entry); await context.close();
    }
    for (const route of ["/", "/projects", "/zakat", "/waqf", "/recurring", "/basket", "/impact", "/knowledge", "/about", "/phase4-not-found"]) {
      const { context, page, diagnostics } = await newPage(viewport); const entry = { route, viewport: viewport.key, expected: "absent" };
      try { await go(page, route); entry.tools = await page.locator(".project-donation-panel,.project-donation-column,.contextual-mobile-donate,.mobile-donation-layer").count(); entry.health = await health(page); } catch (error) { entry.error = String(error?.stack || error); }
      if (entry.error || entry.tools !== 0 || entry.health?.overflow) fail("donation-regression", "Project tool leaked", entry);
      evaluateDiagnostics(entry, diagnostics); await addCase(entry); await context.close();
    }
  }
}

async function runSmoke() {
  const discovery = await newPage(viewports.mobile); const projects = await discoverProjects(discovery.page); await discovery.context.close();
  for (const viewport of [viewports.desktop, viewports.mobile, viewports.narrow]) for (const route of ["/", "/projects", projects.real, projects.fallback, "/zakat", "/waqf", "/recurring", "/basket", "/phase4-not-found"]) {
    const { context, page, diagnostics } = await newPage(viewport); const entry = { route, viewport: viewport.key };
    try { const response = await go(page, route); entry.status = response?.status(); entry.health = await health(page); if (["/",projects.real,projects.fallback,"/basket","/phase4-not-found"].includes(route)) await shot(page, `smoke-${clean(route)}-${viewport.key}`, true); } catch (error) { entry.error = String(error?.stack || error); }
    const expected = route === "/phase4-not-found" ? 404 : 200;
    if (entry.error || entry.status !== expected || entry.health?.brokenImages?.length || entry.health?.overflow || entry.health?.clipped?.length) fail("smoke", "Smoke route failed", entry);
    evaluateDiagnostics(entry, diagnostics); await addCase(entry); await context.close();
  }
}

async function contactSheet() {
  const files = (await fs.readdir(shots)).filter((name) => name.endsWith(".png")).sort(); if (!files.length) return;
  const thumbs = []; for (const file of files.slice(0, 48)) { const input = await sharp(path.join(shots,file)).resize({ width: 320, height: 220, fit: "contain", background: "#fff" }).png().toBuffer(); thumbs.push({ input, top: Math.floor(thumbs.length/3)*230, left: (thumbs.length%3)*330 }); }
  await sharp({ create: { width: 980, height: Math.ceil(thumbs.length/3)*230, channels: 3, background: "#f5f2ea" } }).composite(thumbs).png().toFile(path.join(root,"contact-sheet.png"));
}

try {
  if (job === "cart-currency") await runCartCurrency();
  else if (job === "footer-accessibility") await runFooterAccessibility();
  else if (job === "technical-links") await runTechnicalLinks();
  else if (job === "donation-regression") await runDonationRegression();
  else if (job === "smoke") await runSmoke();
  else throw new Error(`Unknown job ${job}`);
} finally {
  await contactSheet().catch((error) => fail("contact-sheet", String(error)));
  await persist(); await browser.close();
}
if (failures.length) process.exitCode = 1;
