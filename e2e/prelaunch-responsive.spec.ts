import { test, expect } from "@playwright/test";

const viewports = [
  { name: "mobile-360", width: 360, height: 800 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 1000 },
];

function originOf(baseURL: string) {
  return new URL(baseURL).origin;
}

async function fetchXml(url: string) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Sitemap fetch failed ${res.status}: ${url}`);
  return await res.text();
}

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function publicUrls(baseURL: string): Promise<string[]> {
  const origin = originOf(baseURL);
  const index = await fetchXml(`${origin}/sitemap.xml`);
  const children = locs(index);
  const urls = new Set<string>();

  for (const child of children) {
    const childUrl = new URL(child);
    childUrl.protocol = new URL(origin).protocol;
    childUrl.host = new URL(origin).host;
    const xml = await fetchXml(childUrl.toString());
    for (const loc of locs(xml)) {
      const u = new URL(loc);
      u.protocol = new URL(origin).protocol;
      u.host = new URL(origin).host;
      // Stateful/private destinations are intentionally noindex and are covered
      // elsewhere; this sweep targets every URL the sitemap publicly advertises.
      urls.add(u.toString());
    }
  }

  return [...urls].sort();
}

test.describe("prelaunch responsive sitemap sweep", () => {
  test("every public sitemap URL is viewport-safe and free of page/network failures", async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("E2E_BASE_URL is required");

    const urls = await publicUrls(baseURL);
    expect(urls.length, "sitemap should contain public URLs").toBeGreaterThan(20);

    const failures: string[] = [];

    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: "ar",
      });
      const page = await context.newPage();

      const consoleErrors: string[] = [];
      const requestFailures: string[] = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("requestfailed", (req) => {
        requestFailures.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText ?? "failed"}`);
      });

      for (const url of urls) {
        consoleErrors.length = 0;
        requestFailures.length = 0;

        let response;
        try {
          response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
        } catch (error) {
          failures.push(`[${viewport.name}] NAVIGATION ${url}: ${String(error)}`);
          continue;
        }

        const status = response?.status() ?? 0;
        if (status >= 400) failures.push(`[${viewport.name}] HTTP ${status} ${url}`);

        const metrics = await page.evaluate(() => {
          const root = document.documentElement;
          const body = document.body;
          const width = window.innerWidth;
          const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
          const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
            .filter((el) => {
              const style = getComputedStyle(el);
              if (style.position === "fixed" && style.pointerEvents === "none") return false;
              const r = el.getBoundingClientRect();
              return r.width > 0 && (r.right > width + 2 || r.left < -2);
            })
            .slice(0, 12)
            .map((el) => {
              const r = el.getBoundingClientRect();
              return {
                tag: el.tagName.toLowerCase(),
                id: el.id || null,
                cls: typeof el.className === "string" ? el.className.slice(0, 180) : "",
                left: Math.round(r.left),
                right: Math.round(r.right),
                width: Math.round(r.width),
              };
            });
          return { width, scrollWidth, offenders };
        });

        if (metrics.scrollWidth > viewport.width + 2) {
          failures.push(
            `[${viewport.name}] OVERFLOW ${url}: viewport=${viewport.width}, scrollWidth=${metrics.scrollWidth}, offenders=${JSON.stringify(metrics.offenders)}`,
          );
        }

        // Ignore known third-party/browser noise; retain first-party JS failures.
        const firstPartyConsole = consoleErrors.filter(
          (x) => !/Failed to load resource|favicon|clarity|google|facebook|connect\.facebook|doubleclick/i.test(x),
        );
        if (firstPartyConsole.length) {
          failures.push(`[${viewport.name}] CONSOLE ${url}: ${firstPartyConsole.slice(0, 5).join(" | ")}`);
        }

        const firstPartyRequests = requestFailures.filter((x) => {
          try {
            const requestUrl = x.match(/https?:\/\/[^ ]+/)?.[0];
            return !requestUrl || new URL(requestUrl).host === new URL(baseURL).host;
          } catch {
            return true;
          }
        });
        if (firstPartyRequests.length) {
          failures.push(`[${viewport.name}] REQUEST ${url}: ${firstPartyRequests.slice(0, 5).join(" | ")}`);
        }
      }

      await context.close();
    }

    if (failures.length) {
      console.error("\nRESPONSIVE_QA_FAILURES\n" + failures.join("\n"));
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
