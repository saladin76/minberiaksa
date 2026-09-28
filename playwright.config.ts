import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * Two modes, and the difference matters:
 *
 *   Against a deployment. Set `E2E_BASE_URL` (a preview URL, or staging) and the suite points at it
 *   without starting anything. This is what CI does.
 *
 *   Against a local dev server. With no `E2E_BASE_URL`, Playwright starts `next dev` itself and waits
 *   for it. First compile of a cold route in this project can take a while, hence the long timeouts.
 *
 * There is no third mode where the suite invents its own server and database, because a green run
 * against an empty database would say nothing about whether donations work.
 */

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const usingExternal = Boolean(process.env.E2E_BASE_URL);

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
  webServer: usingExternal
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
