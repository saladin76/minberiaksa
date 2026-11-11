import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const exec = promisify(execFile);
const artifactRoot = path.resolve(".artifacts/isolated-financial-acceptance");
const jobs = [
  { title: "one-time checkout, validation, bank handoff and recurring schedule", script: "scripts/checkout-readiness-browser-test.mjs", artifact: "checkout-readiness", minimum: 20 },
  { title: "mixed recurring cart and financial-status UI", script: "scripts/donation-experience-browser-test.mjs", artifact: "donation-experience", minimum: 20 },
  { title: "recurring card 3DS return, failed verification and retry", script: "scripts/subscription-card-browser-test.mjs", artifact: "subscription-card", minimum: 20 },
] as const;

/**
 * Real Playwright Chromium interactions against the actual React components
 * with a loopback HTTP fixture and a synthetic bank.invalid handoff.
 * Not a live provider / DB transaction acceptance test.
 * Each underlying fixture aborts external requests and intercepts the form POST.
 */
for (const { title, script, artifact, minimum } of jobs) {
  test(title, async () => {
    await mkdir(artifactRoot, { recursive: true });
    const { stdout, stderr } = await exec(process.execPath, ["--import", "tsx", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: "mongodb://127.0.0.1:1/no-database?serverSelectionTimeoutMS=100",
        NEXTAUTH_URL: "http://127.0.0.1:3106",
        CONTENT_EDITOR_ARTIFACTS: path.join(artifactRoot, artifact),
        CI: "true",
      },
      timeout: 540_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    expect(stderr).not.toMatch(/(?:Live network forbidden|Unexpected fixture API|Error: AssertionError)/);
    if (artifact === "checkout-readiness") {
      const match = stdout.match(/Checkout readiness browser checks: (\d+) passed\./);
      expect(match, "checkout fixture never reported a completed browser run").not.toBeNull();
      expect(Number(match?.[1])).toBeGreaterThanOrEqual(minimum);
    } else {
      // Donation experience logs its JSON verdict to stdout; subscription-card
      // persists verification.json. Check the actual producer contract rather
      // than declaring a successful browser fixture failed due to report format.
      const report = artifact === "donation-experience"
        ? JSON.parse(stdout.split("\n").reverse().map(line => line.trim()).find(line => /^\{"checks":\d+,/.test(line)) ?? "null")
        : JSON.parse(await readFile(path.join(artifactRoot, artifact, "verification.json"), "utf8"));
      expect(report, "browser fixture did not produce a verification verdict").not.toBeNull();
      expect(report.checks).toBeGreaterThanOrEqual(minimum);
      expect(report.errors ?? report.pageErrors ?? []).toEqual([]);
      if (artifact === "subscription-card") {
        expect(report.productionRequests).toBe(0);
        expect(report.bankCalls).toBe(0);
        expect(report.paymentCaptures).toBe(0);
      }
    }
  });
}
