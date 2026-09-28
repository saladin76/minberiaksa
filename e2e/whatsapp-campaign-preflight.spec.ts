import { test, expect } from "@playwright/test";

import { signInAsStaff, skipUnless, STAFF } from "./support/helpers";

/**
 * WhatsApp readiness, as the dashboard reports it.
 *
 * The behaviour under test is the contract this codebase now has one answer for: a template is sendable
 * only when Meta says a variant of it is approved. The failure it replaced was the dashboard calling a
 * template READY from a hand-typed local field while every send of it failed - so what these assert is
 * that the readiness the screen shows is the readiness the sender would use.
 *
 * Nothing is sent. No Meta API call is made by the test itself; the sync endpoint is exercised only for
 * its refusal path when the provider is not configured.
 */
test.describe("WhatsApp campaign preflight", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    skipUnless(testInfo, STAFF.email && STAFF.password, "E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD not set");
    await signInAsStaff(page, testInfo);
  });

  test("the channel dashboard reports readiness per template and per language", async ({ page }) => {
    const payload = await page.evaluate(async () => {
      const res = await fetch("/api/dashboard/communication/whatsapp?days=30", { credentials: "include" });
      return { status: res.status, body: await res.json().catch(() => null) };
    });

    expect([200, 403], `whatsapp dashboard answered ${payload.status}`).toContain(payload.status);
    if (payload.status !== 200) return;

    const body = payload.body as {
      templates?: { total?: number; ready?: number; rows?: Array<Record<string, unknown>> };
      provider?: { configured?: boolean };
    };
    expect(body.templates, "no templates block in the response").toBeTruthy();

    for (const row of body.templates?.rows ?? []) {
      /* Readiness must be accompanied by the evidence for it. A row that is ready with no approved
         language is the old lie, restated. */
      const approved = Array.isArray(row.approvedLanguages) ? (row.approvedLanguages as string[]) : [];
      if (row.ready === true) {
        expect(approved.length, `template ${String(row.name)} is READY with no approved language`).toBeGreaterThan(0);
      } else {
        /* And a template that is not ready must say why, so an operator can act on it. */
        expect(
          row.state,
          `template ${String(row.name)} is not ready and gives no state`,
        ).toBeTruthy();
      }
      /* `registered` now means Meta told us about it, so it cannot be true with zero variants. */
      if (row.registered === true) {
        expect(
          approved.length + (row.rejectionReason ? 1 : 0) + (row.state === "PENDING" ? 1 : 0),
          `template ${String(row.name)} claims registration with nothing from Meta behind it`,
        ).toBeGreaterThan(0);
      }
    }
  });

  test("the template sync refuses cleanly when Meta is not configured", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/dashboard/communication/whatsapp/templates/sync", {
        method: "POST",
        credentials: "include",
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    });

    /* 200 when the provider is configured and the sync ran, 502 with a named reason when it is not,
       403 without the permission. What must not happen is a 500 with no explanation, or a 200 that
       reports a successful sync of nothing. */
    expect([200, 403, 502], `sync answered ${result.status}`).toContain(result.status);

    const body = result.body as { ok?: boolean; error?: string; summary?: Record<string, unknown> } | null;
    if (result.status === 502) {
      expect(body?.error, "a failed sync gave no reason").toBeTruthy();
    }
    if (result.status === 200) {
      expect(body?.summary, "a successful sync reported no summary").toBeTruthy();
    }
  });

  test("a campaign cannot be built on a template with no approved language", async ({ page }) => {
    const payload = await page.evaluate(async () => {
      const res = await fetch("/api/dashboard/communication/whatsapp?days=30", { credentials: "include" });
      return { status: res.status, body: await res.json().catch(() => null) };
    });
    if (payload.status !== 200) test.skip(true, "whatsapp dashboard not readable in this environment");

    const rows = ((payload.body as { templates?: { rows?: Array<Record<string, unknown>> } })?.templates?.rows ?? []);
    const unready = rows.find((row) => row.ready !== true);
    if (!unready) test.skip(true, "every template in this database is ready; nothing to assert against");

    /* The sendable set and the ready set have to be the same set. `approvedLocales` is what the campaign
       builder constrains language choice by, so an unready template must offer none. */
    const approvedLocales = Array.isArray(unready!.approvedLocales) ? (unready!.approvedLocales as string[]) : [];
    expect(
      approvedLocales.length,
      `template ${String(unready!.name)} is not ready yet offers locales to send in`,
    ).toBe(0);
  });
});
