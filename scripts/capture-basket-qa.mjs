import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const commit = process.env.COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local-uncommitted";
const output = path.resolve("artifacts/basket-visual-qa");
await fs.mkdir(output, { recursive: true });

const baseItems = [
  { id: "qa-zakat", projectId: "gaza-food-parcels", slug: "gaza-food-parcels", projectTitle: "طرود غذائية لأهل غزة", region: "غزة", intent: "zakat", intentLabel: "زكاة", donationMode: "one-time", amount: 250, currency: "USD" },
  { id: "qa-waqf", projectId: "al-quds-home-restoration", slug: "al-quds-home-restoration", projectTitle: "ترميم منازل القدس", region: "القدس", intent: "waqf", intentLabel: "وقف", donationMode: "one-time", amount: 500, currency: "USD", ownerName: "مساهم" },
  { id: "qa-relief", projectId: "gaza-hot-meals", slug: "gaza-hot-meals", projectTitle: "الوجبات الساخنة في غزة", region: "غزة", intent: "urgent", intentLabel: "إغاثة عاجلة", donationMode: "one-time", amount: 100, currency: "USD" },
];

const browser = await chromium.launch({ headless: true });

async function prepare(width, height, items = []) {
  const context = await browser.newContext({ viewport: { width, height }, locale: "ar-SA", colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: "networkidle" });
  const mobile = width < 900;
  const trigger = page.locator(mobile ? ".mobile-header-actions .basket-trigger" : ".utility-account-controls .basket-trigger");
  await trigger.waitFor({ state: "visible" });
  if (items.length) {
    await page.evaluate((entries) => entries.forEach((detail) => window.dispatchEvent(new CustomEvent("minber:add-to-basket", { detail }))), items);
    await page.waitForFunction((count) => Array.from(document.querySelectorAll(".basket-count")).some((element) => element.textContent === String(count)), items.length);
  }
  await trigger.click();
  await page.getByRole("dialog", { name: "سلة العطاء" }).waitFor({ state: "visible" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(180);
  return { context, page };
}

async function capture(name, width, height, items = [], action) {
  const { context, page } = await prepare(width, height, items);
  try {
    if (action) await action(page);
    await page.screenshot({ path: path.join(output, `${name}.png`), animations: "disabled" });
  } finally {
    await context.close();
  }
}

await capture("basket-empty-desktop-1440x1000", 1440, 1000);
await capture("basket-empty-mobile-390x844", 390, 844);
await capture("basket-empty-mobile-360x800", 360, 800);
await capture("basket-single-item-desktop-1440x1000", 1440, 1000, [baseItems[0]]);
await capture("basket-filled-desktop-1440x1000", 1440, 1000, baseItems);
await capture("basket-filled-mobile-390x844", 390, 844, baseItems);
await capture("basket-filled-mobile-360x800", 360, 800, baseItems);
await capture("basket-multi-currency-desktop-1440x1000", 1440, 1000, baseItems.map((item, index) => ({ ...item, currency: ["USD", "TRY", "SAR"][index] })));
await capture("basket-unavailable-desktop-1440x1000", 1440, 1000, [{ ...baseItems[2], available: false }, baseItems[0]]);
await capture("basket-edit-error-mobile-390x844", 390, 844, [{ ...baseItems[0], minimumAmount: 300 }], async (page) => {
  await page.evaluate(() => {
    const input = document.querySelector("[data-basket-item='qa-zakat'] input");
    if (!(input instanceof HTMLInputElement)) throw new Error("Basket amount input not found");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "200");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(300);
});
await capture("basket-long-mobile-390x844", 390, 844, [...baseItems, ...baseItems.map((item, index) => ({ ...item, id: `long-${index}`, projectTitle: `${item.projectTitle} — متابعة` }))]);
await capture("basket-after-remove-mobile-390x844", 390, 844, [baseItems[0]], async (page) => {
  const drawer = page.getByRole("dialog", { name: "سلة العطاء" });
  await drawer.getByRole("button", { name: /إزالة طرود غذائية/ }).click();
  await drawer.getByText("سلة عطائك فارغة", { exact: true }).waitFor({ state: "visible" });
});

async function contactSheet(names, columns, tileWidth, tileHeight, filename) {
  const gap = 18;
  const rows = Math.ceil(names.length / columns);
  const canvasWidth = columns * tileWidth + (columns + 1) * gap;
  const canvasHeight = rows * tileHeight + (rows + 1) * gap;
  const composites = [];
  for (let index = 0; index < names.length; index += 1) {
    const input = path.join(output, `${names[index]}.png`);
    const image = await sharp(input).resize(tileWidth, tileHeight, { fit: "contain", background: "#fffdf8" }).png().toBuffer();
    composites.push({ input: image, left: gap + (index % columns) * (tileWidth + gap), top: gap + Math.floor(index / columns) * (tileHeight + gap) });
  }
  await sharp({ create: { width: canvasWidth, height: canvasHeight, channels: 4, background: "#f1ebe1" } }).composite(composites).png().toFile(path.join(output, filename));
}

await contactSheet([
  "basket-empty-desktop-1440x1000",
  "basket-filled-desktop-1440x1000",
  "basket-multi-currency-desktop-1440x1000",
  "basket-unavailable-desktop-1440x1000",
], 2, 560, 390, "basket-desktop-contact-sheet.png");

await contactSheet([
  "basket-empty-mobile-390x844",
  "basket-filled-mobile-390x844",
  "basket-edit-error-mobile-390x844",
  "basket-long-mobile-390x844",
], 2, 270, 510, "basket-mobile-contact-sheet.png");

const metadata = {
  label: `Local production build screenshots from commit: ${commit}`,
  commit,
  baseURL,
  captures: [
    "basket-empty-desktop-1440x1000.png",
    "basket-empty-mobile-390x844.png",
    "basket-empty-mobile-360x800.png",
    "basket-single-item-desktop-1440x1000.png",
    "basket-filled-desktop-1440x1000.png",
    "basket-filled-mobile-390x844.png",
    "basket-filled-mobile-360x800.png",
    "basket-multi-currency-desktop-1440x1000.png",
    "basket-unavailable-desktop-1440x1000.png",
    "basket-edit-error-mobile-390x844.png",
    "basket-long-mobile-390x844.png",
    "basket-after-remove-mobile-390x844.png",
  ],
};
await fs.writeFile(path.join(output, "metadata.json"), JSON.stringify(metadata, null, 2));
await browser.close();
console.log(metadata.label);
