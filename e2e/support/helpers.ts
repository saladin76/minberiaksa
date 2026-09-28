import { expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

import { SUPPORTED_LOCALES } from "@/lib/locales";

/**
 * Shared ground rules for the end-to-end suite.
 *
 * The single most important one: a test that cannot run must SKIP, never pass. Several of these
 * journeys need a database with real content, or staff credentials, or a payment provider in test
 * mode. A suite that quietly goes green against an empty environment is worse than no suite, because
 * it is then cited as evidence. Every helper here either produces the thing it promises or skips with
 * a message that names what was missing.
 */

export const LOCALES = SUPPORTED_LOCALES;

/** Staff credentials for the dashboard journeys. Absent in most environments, hence `skipUnless`. */
export const STAFF = {
  email: process.env.E2E_STAFF_EMAIL ?? "",
  password: process.env.E2E_STAFF_PASSWORD ?? "",
};

export function skipUnless(testInfo: TestInfo, condition: unknown, reason: string): void {
  if (!condition) testInfo.skip(true, reason);
}

/**
 * Asserts a page rendered rather than merely responded.
 *
 * `toHaveURL` alone passes on a 500: Next serves the error boundary at the same URL. So this checks
 * the response status, that the error boundary is absent, and that the document has real content.
 */
export async function expectPageOk(page: Page, path: string): Promise<void> {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response, `no response for ${path}`).not.toBeNull();
  expect(response!.status(), `${path} responded ${response!.status()}`).toBeLessThan(400);

  /* The App Router error boundary and the 404 page both render at the requested URL, so the status
     code is not enough on its own. */
  await expect(page.locator("body")).not.toContainText("Application error", { timeout: 5_000 });
  await expect(page.locator("body")).not.toContainText("This page could not be found", { timeout: 5_000 });

  const text = (await page.locator("body").innerText().catch(() => "")) || "";
  expect(text.trim().length, `${path} rendered an empty body`).toBeGreaterThan(40);
}

/** The document direction and language a locale must produce. */
export function expectedDir(locale: string): "rtl" | "ltr" {
  return ["ar", "fa", "ur", "he", "ps", "ckb"].includes(locale) ? "rtl" : "ltr";
}

/**
 * Signs in as staff through the real credentials form.
 *
 * Deliberately not a cookie injection: the sign-in form, the redirect back, and the session cookie's
 * own attributes are part of what these journeys are meant to cover.
 */
export async function signInAsStaff(page: Page, testInfo: TestInfo): Promise<void> {
  skipUnless(testInfo, STAFF.email && STAFF.password, "E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD not set");

  await page.goto("/ar/auth/signin", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/بريد|email/i).first().fill(STAFF.email);
  await page.getByLabel(/كلمة المرور|password/i).first().fill(STAFF.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/auth/signin"), { timeout: 45_000 }),
    page.getByRole("button", { name: /دخول|تسجيل|sign in/i }).first().click(),
  ]);
}

/** The list endpoints answer `{ items }`; a bare array is tolerated so the helper survives a change. */
function itemsOf(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const items = (body as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? items : [];
}

/** A first campaign id/slug from the public API, or a skip when the database has no campaigns. */
export async function firstCampaign(
  request: APIRequestContext,
  testInfo: TestInfo,
): Promise<{ id: string; slug: string | null }> {
  const response = await request.get("/api/campaigns?limit=1");
  skipUnless(testInfo, response.ok(), `/api/campaigns responded ${response.status()}`);
  const list = itemsOf(await response.json().catch(() => null));
  skipUnless(testInfo, list.length > 0, "no campaigns in this database");
  const first = list[0] as { id?: string; slug?: string | null };
  skipUnless(testInfo, first?.id, "campaign row has no id");
  return { id: String(first.id), slug: first.slug ?? null };
}

/** A first published post id/slug, or a skip when the database has no posts. */
export async function firstPost(
  request: APIRequestContext,
  testInfo: TestInfo,
): Promise<{ id: string; slug: string | null }> {
  const response = await request.get("/api/posts?limit=1");
  skipUnless(testInfo, response.ok(), `/api/posts responded ${response.status()}`);
  const list = itemsOf(await response.json().catch(() => null));
  skipUnless(testInfo, list.length > 0, "no posts in this database");
  const first = list[0] as { id?: string; slug?: string | null };
  skipUnless(testInfo, first?.id, "post row has no id");
  return { id: String(first.id), slug: first.slug ?? null };
}
