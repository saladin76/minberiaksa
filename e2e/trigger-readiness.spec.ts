import { test, expect } from "@playwright/test";

import { signInAsStaff, skipUnless, STAFF } from "./support/helpers";

/**
 * A trigger cannot be switched on unless it can actually send.
 *
 * The failure this covers: enabling a WhatsApp trigger was a single boolean write, so a trigger could
 * sit enabled for weeks, fire on every donation, and skip every one with
 * META_TEMPLATE_REQUIRED_FOR_AUTOMATIC_WHATSAPP in the delivery log while the screen showed it healthy.
 * Donors never got their receipts.
 *
 * These tests assert the gate, and assert that readiness travels with each row so a trigger that loses
 * its approval after being enabled is visible rather than silently broken.
 */
test.describe("trigger readiness", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    skipUnless(testInfo, STAFF.email && STAFF.password, "E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD not set");
    await signInAsStaff(page, testInfo);
  });

  test("every trigger reports its readiness, with reasons when it is not ready", async ({ page }) => {
    const payload = await page.evaluate(async () => {
      const res = await fetch("/api/templates/triggers", { credentials: "include" });
      return { status: res.status, body: await res.json().catch(() => null) };
    });

    expect([200, 403], `triggers API answered ${payload.status}`).toContain(payload.status);
    if (payload.status !== 200) return;

    const triggers = ((payload.body as { triggers?: Array<Record<string, unknown>> })?.triggers ?? []);
    for (const trigger of triggers) {
      const preflight = trigger.preflight as { ok?: boolean; problems?: Array<{ code?: string; messageAr?: string }> } | null;
      expect(preflight, `trigger ${String(trigger.event)} carries no preflight`).toBeTruthy();

      if (preflight!.ok === false) {
        /* Not ready is fine. Not ready with no stated problem is not: that is the state an operator
           cannot act on. */
        expect(preflight!.problems?.length, `trigger ${String(trigger.event)} is not ready and says nothing`).toBeGreaterThan(0);
        for (const problem of preflight!.problems ?? []) {
          expect(problem.code, "a preflight problem with no code").toBeTruthy();
          expect(problem.messageAr, "a preflight problem with no reader-facing message").toBeTruthy();
        }
      }
    }
  });

  test("an enabled trigger that cannot send is visible as such", async ({ page }) => {
    const payload = await page.evaluate(async () => {
      const res = await fetch("/api/templates/triggers", { credentials: "include" });
      return { status: res.status, body: await res.json().catch(() => null) };
    });
    if (payload.status !== 200) test.skip(true, "triggers API not readable in this environment");

    const triggers = ((payload.body as { triggers?: Array<Record<string, unknown>> })?.triggers ?? []);
    const enabledButBroken = triggers.filter(
      (t) => t.enabled === true && (t.preflight as { ok?: boolean } | null)?.ok === false,
    );

    /* This is deliberately not a failure: a template's approval can lapse at Meta after a trigger was
       switched on, and that is exactly the state the report is meant to surface. What the test asserts
       is that each one names its problem, so the condition is actionable rather than silent. */
    for (const trigger of enabledButBroken) {
      const problems = (trigger.preflight as { problems?: Array<{ code?: string }> }).problems ?? [];
      expect(problems.length, `enabled trigger ${String(trigger.event)} is broken and unexplained`).toBeGreaterThan(0);
    }
    if (enabledButBroken.length) {
      console.warn(`${enabledButBroken.length} enabled trigger(s) currently cannot send; each reports why.`);
    }
  });

  test("enabling a trigger on an unsendable template is refused", async ({ page }) => {
    /* Attempted against a template that is not ready. The expected answer is 409 TRIGGER_NOT_READY with
       the preflight attached, so the dashboard can say what to fix. A 200 here would mean the gate is
       gone. */
    const templates = await page.evaluate(async () => {
      const res = await fetch("/api/dashboard/communication/whatsapp?days=7", { credentials: "include" });
      if (!res.ok) return null;
      const body = await res.json().catch(() => null);
      return (body as { templates?: { rows?: Array<Record<string, unknown>> } })?.templates?.rows ?? [];
    });
    if (!templates) test.skip(true, "whatsapp dashboard not readable in this environment");

    const unready = templates!.find((row) => row.ready !== true);
    if (!unready) test.skip(true, "every template is ready; nothing unsendable to attempt");

    const result = await page.evaluate(async (templateId) => {
      const res = await fetch("/api/templates/triggers", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "DONATION_PAID", channel: "WHATSAPP", templateId, enabled: true }),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    }, String(unready!.id));

    expect(result.status, "an unsendable trigger was accepted as enabled").not.toBe(200);
    if (result.status === 409) {
      const body = result.body as { error?: string; preflight?: { problems?: unknown[] } };
      expect(body.error).toBe("TRIGGER_NOT_READY");
      expect(body.preflight?.problems?.length, "refusal carried no problems").toBeGreaterThan(0);
    }
  });
});
