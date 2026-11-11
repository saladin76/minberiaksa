import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The integration suite transpiles TS into .integration-test-build. Resolve the
// CLI from the repo root rather than a relative path inside the test build.
async function loadAudit() {
  const url = pathToFileURL(resolve(process.cwd(), "scripts/qa-public-url-inventory.mjs")).href;
  // Native import is retained even when this test is transpiled to CommonJS.
  return (new Function("specifier", "return import(specifier)"))(url) as Promise<{
    locs: (xml: string) => string[];
    safePublicUrl: (url: string) => URL | null;
    queryRetained: (from: string, to: string) => boolean;
    resolveRedirect: (from: string, fetcher: (url: string) => Promise<Response>) => Promise<{status: string | number; hops?: Array<{retainedQuery: boolean}>}>;
    LEGACY_AD_PROBES: string[];
  }>;
}

test("sitemap index / shard inventory extracts all loc entries without altering URLs", async () => {
  const audit = await loadAudit();
  assert.deepEqual(audit.locs("<sitemapindex><sitemap><loc>https://minberiaksa.org/sitemap/static.xml</loc></sitemap><sitemap><loc>https://minberiaksa.org/sitemap/posts-0.xml</loc></sitemap></sitemapindex>"), [
    "https://minberiaksa.org/sitemap/static.xml", "https://minberiaksa.org/sitemap/posts-0.xml",
  ]);
});
test("read-only public audit must never contact private, checkout or other hosts", async () => {
  const audit = await loadAudit();
  for (const path of ["/ar/checkout", "/tr/cart", "/en/account", "/ar/success/fixture", "/api/donations", "/dashboard", "/ar/receipt/fixture", "/ar/payment-failed"]) {
    assert.equal(audit.safePublicUrl("https://minberiaksa.org" + path), null, path);
  }
  assert.equal(audit.safePublicUrl("http://minberiaksa.org/ar/bagislar"), null);
  assert.equal(audit.safePublicUrl("https://other.example/ar/bagislar"), null);
  assert.ok(audit.safePublicUrl("https://minberiaksa.org/tr/bagislar/example"));
});
test("redirect audit refuses loss of repeated UTM values and click IDs", async () => {
  const audit = await loadAudit();
  const source = "https://minberiaksa.org/ar/ghr?utm_source=ads&utm_campaign=test&gclid=x&fbclid=y&ref=a&ref=b";
  assert.equal(audit.queryRetained(source, "https://minberiaksa.org/ar/bagislar?utm_source=ads&utm_campaign=test&gclid=x&fbclid=y&ref=a&ref=b"), true);
  assert.equal(audit.queryRetained(source, "https://minberiaksa.org/ar/bagislar?utm_source=ads&utm_campaign=test&gclid=x&fbclid=y&ref=a"), false);
});
test("redirect audit reports canonical redirection and catches dropped ad attribution", async () => {
  const audit = await loadAudit();
  const from = "https://minberiaksa.org/ar/ghr?utm_source=facebook&gclid=TEST";
  const success = await audit.resolveRedirect(from, async (url: string) => ({
    status: url.includes("/ghr") ? 308 : 200,
    headers: new Headers(url.includes("/ghr") ? { location: "/ar/bagislar?utm_source=facebook&gclid=TEST" } : {}),
  } as Response));
  assert.equal(success.status, 200);
  assert.equal(success.hops?.length, 1);
  assert.equal(success.hops?.[0].retainedQuery, true);
  const failure = await audit.resolveRedirect(from, async (url: string) => ({
    status: url.includes("/ghr") ? 301 : 200,
    headers: new Headers(url.includes("/ghr") ? { location: "/ar/bagislar" } : {}),
  } as Response));
  assert.equal(failure.status, "QUERY_LOST");
});
test("known old ad URLs are inventoried, not deleted or redirected to a guessed recipient", async () => {
  const audit = await loadAudit();
  assert.ok(audit.LEGACY_AD_PROBES.includes("/ar/donates"));
  assert.ok(LEGACY_AD_PROBES.includes("/ar/monthly-donate"));
  assert.ok(LEGACY_AD_PROBES.includes("/ar/ghr"));
  const config = readFileSync("next.config.ts", "utf8");
  assert.match(config, /source: "\/ar\/ghr"/);
  assert.match(config, /source: "\/ar\/monthly-donate"/);
  assert.match(config, /source: "\/ar\/donates"/);
  assert.match(config, /source: "\/donates"/);
  assert.ok(readFileSync("app/[locale]/campaigns/page.tsx", "utf8").includes("CampaignsPageContent"),
    "legacy /campaigns is still a real page and must not be removed by assumption");
});
