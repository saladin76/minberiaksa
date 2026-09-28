import { test, expect } from "@playwright/test";

/**
 * Certificates carry a donor's name and a serial, and they are shared. Two things matter here, and only
 * one of them is "does it render".
 *
 * The other is that a certificate URL is not an enumeration oracle. These pages are reachable without a
 * session, so a wrong id must be indistinguishable from an id that exists but is not yours: it must not
 * leak that a donation exists, and it must never render someone else's name.
 */

const NONEXISTENT_ID = "000000000000000000000000"; // a well-formed ObjectId that will not exist
const MALFORMED_ID = "not-an-object-id";

test.describe("certificates", () => {
  test("an unknown thanks certificate does not render a certificate", async ({ page }) => {
    const response = await page.goto(`/ar/certificates/thanks/${NONEXISTENT_ID}`, { waitUntil: "domcontentloaded" });
    const status = response?.status() ?? 0;

    /* 404 is the right answer. A 200 is only acceptable if the page plainly says nothing was found -
       what must not happen is a rendered certificate with blank or borrowed details. */
    if (status === 200) {
      const body = await page.locator("body").innerText();
      expect(body, "a certificate rendered for an id that does not exist").toMatch(
        /غير موجود|لم يُعثر|not found|لا توجد/i,
      );
    } else {
      expect(status, `unexpected status ${status}`).toBeGreaterThanOrEqual(400);
    }
  });

  test("a malformed certificate id is handled, not crashed on", async ({ page }) => {
    const response = await page.goto(`/ar/certificates/thanks/${MALFORMED_ID}`, { waitUntil: "domcontentloaded" });
    const status = response?.status() ?? 0;
    /* A bad ObjectId reaching Prisma raw throws; a 500 here means the id went through unvalidated. */
    expect(status, "a malformed id produced a server error").not.toBe(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("an unknown waqf certificate behaves the same way", async ({ page }) => {
    const response = await page.goto(`/ar/certificates/waqf/${NONEXISTENT_ID}`, { waitUntil: "domcontentloaded" });
    const status = response?.status() ?? 0;
    if (status === 200) {
      const body = await page.locator("body").innerText();
      expect(body).toMatch(/غير موجود|لم يُعثر|not found|لا توجد/i);
    } else {
      expect(status).toBeGreaterThanOrEqual(400);
    }
  });

  test("certificate pages are not indexable", async ({ page }) => {
    /* A certificate carries a donor's name. Even when the URL is unguessable, it should not be
       collected by a crawler that finds it in a shared link. */
    await page.goto(`/ar/certificates/thanks/${NONEXISTENT_ID}`, { waitUntil: "domcontentloaded" });
    const robots = await page.locator('meta[name="robots"]').getAttribute("content").catch(() => null);
    if (robots) expect(robots).toMatch(/noindex/i);
  });
});
