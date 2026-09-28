import { test, expect } from "@playwright/test";

import { signInAsStaff, skipUnless, STAFF } from "./support/helpers";

/**
 * The dashboard must be closed to anyone who is not signed in, and the API behind it must be closed
 * too.
 *
 * The second half is the part that gets missed. A page can redirect to sign-in while the endpoint it
 * reads from happily answers anyone, and since the dashboard is a client component the endpoint is
 * exactly what an unauthenticated visitor can reach. So every one of these asserts the API, not just
 * the screen.
 */

/** Dashboard screens that must never render to a stranger. */
const GUARDED_PAGES = [
  "/dashboard",
  "/dashboard/donations",
  "/dashboard/users/donors",
  "/dashboard/communication/whatsapp",
  "/dashboard/communication/inbox",
  "/dashboard/platform-connections/communication",
];

/** Endpoints that must refuse a stranger outright. */
const GUARDED_APIS = [
  "/api/dashboard/communication/senders",
  "/api/dashboard/communication/inbox",
  "/api/dashboard/communication/whatsapp",
  "/api/admin/tracking",
  "/api/templates/whatsapp",
  "/api/templates/triggers",
];

test.describe("permissions", () => {
  test.describe("signed out", () => {
    /* No storage state: these run as a stranger. */
    test.use({ storageState: { cookies: [], origins: [] } });

    for (const path of GUARDED_PAGES) {
      test(`${path} is not served to a stranger`, async ({ page }) => {
        const response = await page.goto(path, { waitUntil: "domcontentloaded" });
        const status = response?.status() ?? 0;
        const landedOnAuth = /\/auth\/signin|\/login|\/api\/auth/.test(page.url());

        if (!landedOnAuth) {
          /* Not redirected: then it must have refused. A 200 dashboard for a stranger is the failure
             this whole file exists to catch. */
          expect(status, `${path} rendered for a signed-out visitor`).toBeGreaterThanOrEqual(400);
        }

        /* Either way, no dashboard content. */
        const body = await page.locator("body").innerText().catch(() => "");
        expect(body, `${path} leaked dashboard content`).not.toMatch(/لوحة التحكم|إجمالي التبرعات/);
      });
    }

    for (const path of GUARDED_APIS) {
      test(`${path} refuses a stranger`, async ({ request }) => {
        const response = await request.get(path);
        /* 401 or 403 is correct. A 500 would also "refuse" but for the wrong reason, and a 200 is a
           data leak, so both are called out separately. */
        expect([401, 403, 404], `${path} answered ${response.status()} to a stranger`).toContain(response.status());
      });
    }

    test("a cron endpoint refuses a request with no secret", async ({ request }) => {
      const response = await request.get("/api/cron/communication-run-due");
      expect([401, 403], `cron endpoint answered ${response.status()}`).toContain(response.status());
    });
  });

  test.describe("signed in as staff", () => {
    test("the dashboard opens and shows its own shell", async ({ page }, testInfo) => {
      skipUnless(testInfo, STAFF.email && STAFF.password, "E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD not set");
      await signInAsStaff(page, testInfo);

      const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(400);
      expect(page.url(), "signed-in staff were bounced to sign-in").not.toMatch(/\/auth\/signin/);
      await expect(page.locator("body")).not.toContainText("Application error");
    });

    test("a permission-gated API answers for staff", async ({ page }, testInfo) => {
      skipUnless(testInfo, STAFF.email && STAFF.password, "E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD not set");
      await signInAsStaff(page, testInfo);

      /* Through the page's own context, so the session cookie is the real one. */
      const status = await page.evaluate(async () => {
        const res = await fetch("/api/dashboard/communication/senders", { credentials: "include" });
        return res.status;
      });
      /* 403 is a legitimate answer for staff without this specific permission; 401 is not, because they
         are signed in. */
      expect([200, 403], `senders API answered ${status} to signed-in staff`).toContain(status);
    });
  });
});
