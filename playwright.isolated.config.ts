import { defineConfig } from "@playwright/test";

// Real Playwright runner, isolated React/browser fixtures only; no deployment
// or bank sandbox is implied. No Next.js webServer or real DB is started.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "isolated-financial-acceptance.spec.ts",
  timeout: 600_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  reporter: [["github"], ["list"], ["html", { outputFolder: ".artifacts/isolated-financial-acceptance/report", open: "never" }]],
  use: { browserName: "chromium", trace: "off" },
});
