import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "../../scripts/dashboard-pr202-staging-acceptance.mjs");
type Fault = "none" | "wrong-chart" | "duplicate-page" | "no-cross-day";
type Donation = {
  id: string; status: "PAID" | "FAILED"; createdAt: string;
  paidAt: string | null; amountUSD: number; amount: number; currency: "USD";
};
const COOKIE = {
  admin: "acceptance-fixture-admin-secret",
  revenue: "acceptance-fixture-revenue-secret",
  denied: "acceptance-fixture-denied-secret",
  donor: "acceptance-fixture-donor-secret",
};

function fixtures(fault: Fault): Donation[] {
  const paid: Donation[] = Array.from({ length: 101 }, (_, i) => ({
    id: "fixture-paid-" + i,
    status: "PAID",
    createdAt: "2026-11-11T07:00:00.000Z",
    paidAt: "2026-11-11T08:00:00.000Z",
    amountUSD: 5, amount: 5, currency: "USD",
  }));
  paid[0] = {
    ...paid[0],
    createdAt: fault === "no-cross-day" ? "2026-11-11T07:00:00.000Z" : "2026-11-10T20:45:00.000Z",
    paidAt: fault === "no-cross-day" ? "2026-11-11T08:00:00.000Z" : "2026-11-10T21:30:00.000Z",
  };
  return [
    ...paid,
    { id: "fixture-failed", status: "FAILED", paidAt: null, createdAt: "2026-11-11T10:00:00.000Z", amountUSD: 7, amount: 7, currency: "USD" },
    { id: "fixture-pending", status: "PAID", paidAt: null, createdAt: "2026-11-11T11:00:00.000Z", amountUSD: 9, amount: 9, currency: "USD" },
  ];
}

function filtered(rows: Donation[], status: string): Donation[] {
  return rows.filter(r => {
    const paid = r.status === "PAID" && r.paidAt !== null;
    const failed = r.status === "FAILED";
    const pending = r.status === "PAID" && r.paidAt === null;
    if (status === "PAID") return paid;
    if (status === "FAILED") return failed;
    if (status === "PENDING") return pending;
    if (status === "RESOLVED") return paid || failed;
    return paid || failed || pending;
  });
}

async function exercise(fault: Fault) {
  const rows = fixtures(fault);
  const requests: string[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const cookie = req.headers.cookie ?? "";
    const role = Object.entries(COOKIE).find(([, v]) => v === cookie)?.[0];
    const status = role == null ? 401 : role === "denied" || role === "donor" ? 403 : 200;
    const send = (httpStatus: number, body: unknown) => {
      res.writeHead(httpStatus, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    requests.push(url.pathname);
    if (url.pathname === "/api/admin/dashboard-filter-options") {
      return send(status, status === 200 ? { items: [{ id: "campaign-fixture", title: "Fixture", categoryIds: ["cat"] }] } : { error: "unauthorized" });
    }
    if (url.pathname === "/api/admin/donations/chart") {
      if (status !== 200) return send(status, { error: "unauthorized" });
      const selected = filtered(rows, url.searchParams.get("status") ?? "RESOLVED");
      const paid = selected.filter(r => r.status === "PAID" && r.paidAt);
      const failed = selected.filter(r => r.status === "FAILED");
      const pending = selected.filter(r => r.status === "PAID" && !r.paidAt);
      const count = paid.length + (fault === "wrong-chart" && url.searchParams.get("status") === "PAID" ? 1 : 0);
      return send(200, [{ date: "2026-11-11", count,
        amountUSD: paid.reduce((sum,r) => sum + r.amountUSD, 0),
        countFailed: failed.length, countPending: pending.length }]);
    }
    if (url.pathname === "/api/donations") {
      if (status !== 200) return send(status, { error: "unauthorized" });
      const selected = filtered(rows, url.searchParams.get("status") ?? "RESOLVED");
      const limit = Math.min(Number(url.searchParams.get("limit") || 10),100);
      const page = Number(url.searchParams.get("page") || 1);
      const pages = Math.ceil(selected.length / limit);
      const slice = selected.slice((page - 1) * limit, page * limit);
      if (fault === "duplicate-page" && page === 2 && url.searchParams.get("status") === "PAID" && slice.length) {
        slice[0] = selected[0];
      }
      return send(200, { donations: slice, pagination: { total: selected.length, pages, page, limit } });
    }
    return send(404, { error: "unexpected path" });
  });

  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", ok);
  });
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw Error("Test server unavailable");
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        STAGING_URL: "http://127.0.0.1:" + address.port,
        STAGING_ALLOWED_HOST: "127.0.0.1",
        STAGING_ADMIN_COOKIE: COOKIE.admin,
        STAGING_REVENUE_STAFF_COOKIE: COOKIE.revenue,
        STAGING_DENIED_STAFF_COOKIE: COOKIE.denied,
        STAGING_DONOR_COOKIE: COOKIE.donor,
        STAGING_START: "2026-11-10", STAGING_END: "2026-11-11",
        STAGING_QUERY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", x => { stdout += x; });
    child.stderr.setEncoding("utf8").on("data", x => { stderr += x; });
    const [code] = await once(child, "close");
    return { code, stdout, stderr, requests };
  } finally {
    await new Promise<void>((ok, fail) => server.close(err => err ? fail(err) : ok()));
  }
}

test("read-only staging acceptance checks roles, all five statuses and >100 paginated donations", async () => {
  const r = await exercise("none");
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /All staging acceptance comparisons and required settlement coverage passed/);
  assert.match(r.stdout, /"crossDaySettlements":1/);
  assert.match(r.stdout, /"settledPaid":101/);
  assert.match(r.stdout, /"status":"all"/);
  assert.ok(r.requests.filter(p => p === "/api/donations").length >= 8);
  for (const secret of Object.values(COOKIE)) assert.equal((r.stdout + r.stderr).includes(secret), false);
  assert.equal((r.stdout + r.stderr).includes("fixture-paid-0"), false);
});

test("staging acceptance rejects incorrect financial chart totals", async () => {
  const r = await exercise("wrong-chart");
  assert.notEqual(r.code, 0);
  assert.match(r.stdout, /"result":"MISMATCH"/);
  assert.match(r.stderr, /comparison\(s\) require review|acceptance mismatch or coverage gap/);
});

test("staging acceptance rejects duplicated donation rows across paginated pages", async () => {
  const r = await exercise("duplicate-page");
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /duplicate donation IDs across paginated results/);
});

test("staging acceptance rejects good-looking totals without cross-day settlements", async () => {
  const r = await exercise("no-cross-day");
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /NOT COVERED: no cross-day settled donation/);
});
