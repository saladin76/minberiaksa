import { test, expect } from "@playwright/test";

const viewports = [
  { name: "mobile-360", width: 360, height: 800 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 1000 },
];

const sitemapPaths = [
  "/sitemap/static.xml",
  "/sitemap/campaigns-0.xml",
  "/sitemap/campaigns-1.xml",
  "/sitemap/categories-0.xml",
  "/sitemap/posts-0.xml",
  "/sitemap/posts-1.xml",
  "/sitemap/posts-2.xml",
];

const chunkSize = 100;
// Eight chunks per shard cover up to 1,600 URLs in a single shard while still
// allowing Playwright workers to parallelise the full sweep safely.
const chunks = Array.from({ length: 16 }, (_, index) => ({
  start: index * chunkSize,
  end: (index + 1) * chunkSize,
}));

const extraShellPaths = [
  "/ar/cart",
  "/ar/checkout",
  "/ar/bank-transfer",
  "/ar/recurring-donation",
  "/ar/zakat",
  "/ar/zakat-calculator",
  "/ar/payment-failed",
  "/ar/payment-cancelled",
  "/ar/payment-pending",
  "/ar/payment-processing",
  "/ar/donation-failed",
  "/ar/auth/signin",
];

function originOf(baseURL: string) {
  return new globalThis.URL(baseURL).origin;
}

async function fetchXml(url: string) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Sitemap fetch failed ${res.status}: ${url}`);
  return await res.text();
}

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

function onTestOrigin(raw: string, origin: string) {
  const u = new globalThis.URL(raw);
  const target = new globalThis.URL(origin);
  u.protocol = target.protocol;
  u.host = target.host;
  return u.toString();
}

async function inspectUrl(
  page: import("@playwright/test").Page,
  url: string,
  failures: string[],
) {
  const consoleErrors: string[] = [];
  const requestFailures: string[] = [];

  const onConsole = (msg: import("@playwright/test").ConsoleMessage) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  };
  const onRequestFailed = (req: import("@playwright/test").Request) => {
    requestFailures.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText ?? "failed"}`);
  };

  page.on("console", onConsole);
  page.on("requestfailed", onRequestFailed);

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const status = response?.status() ?? 0;
    if (status >= 400) failures.push(`HTTP ${status} ${url}`);

    // The page is loaded once. Responsive CSS/JS then reflows against every
    // required viewport without multiplying 1,949 URLs by five navigations.
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(80);

      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        const viewportWidth = window.innerWidth;
        const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
        const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
          .filter((el) => {
            const style = getComputedStyle(el);
            if (style.position === "fixed" && style.pointerEvents === "none") return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > viewportWidth + 2 || r.left < -2);
          })
          .slice(0, 8)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              tag: el.tagName.toLowerCase(),
              id: el.id || null,
              cls: typeof el.className === "string" ? el.className.slice(0, 140) : "",
              left: Math.round(r.left),
              right: Math.round(r.right),
              width: Math.round(r.width),
            };
          });
        return { viewportWidth, scrollWidth, offenders };
      });

      if (metrics.scrollWidth > viewport.width + 2) {
        failures.push(
          `[${viewport.name}] OVERFLOW ${url}: viewport=${viewport.width}, scrollWidth=${metrics.scrollWidth}, offenders=${JSON.stringify(metrics.offenders)}`,
        );
      }
    }

    const firstPartyConsole = consoleErrors.filter(
      (x) => !/Failed to load resource|favicon|clarity|google|facebook|connect\.facebook|doubleclick/i.test(x),
    );
    if (firstPartyConsole.length) {
      failures.push(`CONSOLE ${url}: ${firstPartyConsole.slice(0, 5).join(" | ")}`);
    }

    const host = new globalThis.URL(url).host;
    const firstPartyRequests = requestFailures.filter((entry) => {
      const match = entry.match(/https?:\/\/[^ ]+/)?.[0];
      if (!match) return true;
      try { return new globalThis.URL(match).host === host; } catch { return true; }
    });
    if (firstPartyRequests.length) {
      failures.push(`REQUEST ${url}: ${firstPartyRequests.slice(0, 5).join(" | ")}`);
    }
  } catch (error) {
    failures.push(`NAVIGATION ${url}: ${String(error)}`);
  } finally {
    page.off("console", onConsole);
    page.off("requestfailed", onRequestFailed);
  }
}

test.describe.parallel("prelaunch responsive sitemap sweep", () => {
  for (const sitemapPath of sitemapPaths) {
    for (const chunk of chunks) {
      test(`${sitemapPath} URLs ${chunk.start}-${chunk.end - 1}`, async ({ page, baseURL }) => {
        test.setTimeout(20 * 60_000);
        if (!baseURL) throw new Error("E2E_BASE_URL is required");
        const origin = originOf(baseURL);
        const xml = await fetchXml(origin + sitemapPath);
        const urls = locs(xml).slice(chunk.start, chunk.end).map((url) => onTestOrigin(url, origin));
        if (!urls.length) return;

        const failures: string[] = [];
        for (const url of urls) await inspectUrl(page, url, failures);

        if (failures.length) console.error("\nRESPONSIVE_QA_FAILURES\n" + failures.join("\n"));
        expect(failures, failures.join("\n")).toEqual([]);
      });
    }
  }

  test("critical noindex/public shells", async ({ page, baseURL }) => {
    test.setTimeout(5 * 60_000);
    if (!baseURL) throw new Error("E2E_BASE_URL is required");
    const origin = originOf(baseURL);
    const failures: string[] = [];
    for (const path of extraShellPaths) await inspectUrl(page, origin + path, failures);
    if (failures.length) console.error("\nRESPONSIVE_QA_FAILURES\n" + failures.join("\n"));
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
