import test from "node:test";
import assert from "node:assert/strict";

const base = (process.env.LOAD_BASE_URL || "https://minberiaksa.vercel.app").replace(/\/$/, "");

const targets = [
  "/api/campaigns?locale=ar&limit=12&page=1",
  "/api/campaigns?locale=en&limit=12&page=1",
  "/api/campaigns/main",
  "/api/categories?locale=ar&limit=100",
  "/api/categories?locale=en&limit=100",
  "/api/bank-accounts?locale=ar",
  "/sitemap.xml",
];

const concurrency = 5;
const requestsPerTarget = 20;
const timeoutMs = 15_000;

async function timedFetch(path: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(base + path, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "MinberAksa-Prelaunch-ReadOnly-QA/1.0" },
    });
    const body = await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      ms: performance.now() - started,
      bytes: body.byteLength,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runTarget(path: string) {
  const results: Array<{ ok: boolean; status: number; ms: number; bytes: number }> = [];
  for (let offset = 0; offset < requestsPerTarget; offset += concurrency) {
    const batch = Array.from(
      { length: Math.min(concurrency, requestsPerTarget - offset) },
      () => timedFetch(path),
    );
    results.push(...(await Promise.all(batch)));
  }
  const sorted = results.map((r) => r.ms).sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  const failures = results.filter((r) => !r.ok);
  return {
    path,
    requests: results.length,
    failures: failures.length,
    statuses: [...new Set(results.map((r) => r.status))],
    avgMs: results.reduce((sum, r) => sum + r.ms, 0) / Math.max(results.length, 1),
    p95Ms: p95,
    maxMs: Math.max(...results.map((r) => r.ms)),
  };
}

test("light read-only production load check", async () => {
  const reports = [];
  for (const target of targets) reports.push(await runTarget(target));

  console.log("LOAD_TEST_REPORT " + JSON.stringify(reports, null, 2));

  for (const report of reports) {
    assert.equal(report.failures, 0, `${report.path} had failed responses`);
    assert.ok(report.p95Ms < 8_000, `${report.path} p95 too high: ${report.p95Ms.toFixed(0)}ms`);
  }
});
