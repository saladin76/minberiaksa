import { defineConfig, devices } from "@playwright/test";

/**
 * The full suite may write to Staging. Local development, the production URL,
 * and any CI execution without the authenticated remote attestation are denied.
 * Synthetic fixtures use playwright.isolated.config.ts instead.
 */
const rawBase = process.env.E2E_BASE_URL;
if (process.env.E2E_PREFLIGHT_PASSED !== "1" || !rawBase ||
    rawBase !== process.env.STAGING_APPROVED_BASE_URL ||
    process.env.STAGING_APPROVED_SHA !== process.env.GITHUB_SHA) {
  throw new Error("E2E_STAGING_PREFLIGHT_REQUIRED: use the reviewed GitHub Environment");
}
let parsed: URL;
try { parsed = new URL(rawBase); }
catch { throw new Error("E2E_STAGING_BASE_URL_INVALID"); }
const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
    parsed.search || parsed.hash || (parsed.pathname !== "/" && parsed.pathname !== "") ||
    ["minberiaksa.org","www.minberiaksa.org","minberiaksa.vercel.app","localhost","127.0.0.1","::1"].includes(host) ||
    !/(^|[.-])(stage|staging|qa)([.-]|$)/.test(host)) {
  throw new Error("E2E_PRODUCTION_OR_UNREVIEWED_TARGET_DENIED");
}
const baseURL = parsed.origin;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts/test-results",
  /* Routes compile on first hit in dev, and several of these pages are heavy. */
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  /* A journey that only passes on a retry is a flaky journey, and CI should say so rather than hide
     it, so retries exist only to keep a whole run from being thrown away by one network blip. */
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: "e2e/.artifacts/report", open: "never" }], ["list"]]
    : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    /* The site is Arabic-first and right-to-left; running the browser in any other locale would test
       a configuration no donor uses. */
    locale: "ar",
    timezoneId: "Europe/Istanbul",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      /* A phone viewport is not a nice-to-have here: most donations arrive on one, and the quick
         donate bar, the cart and the checkout all have distinct mobile layouts. */
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /(donation-checkout|quick-donate)\.spec\.ts/,
    },
  ],
  webServer: undefined, // Never start a dev server with inherited production credentials.
});
