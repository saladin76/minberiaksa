import test from "node:test";
import assert from "node:assert/strict";
import { campaignAttributionDiagnostic, readAttributionStage } from "../../lib/communication/campaign-attribution-diagnostics";

test("financial read diagnostics identify the failing stage without disclosing error text", async () => {
  const cause = Object.assign(new Error("private-contact@example.invalid token=secret execution exceeded time limit"), { code: "P2010", meta: { message: "private query payload" } });
  await assert.rejects(readAttributionStage("EMAIL_HISTORY", async () => { throw cause; }), error => {
    assert.deepEqual(campaignAttributionDiagnostic(error), { stage: "EMAIL_HISTORY", reason: "DATABASE_TIMEOUT", code: "P2010" });
    assert.doesNotMatch(JSON.stringify(campaignAttributionDiagnostic(error)), /private|secret|token|query/);
    return true;
  });
});

test("engine errors, incomplete scans and unknown failures remain distinct fixed reasons", async () => {
  for (const [cause, reason, code] of [
    [{ code: "P2023", message: "sensitive" }, "QUERY_OPTIONS_INVALID", "P2023"],
    [{ code: "P2032" }, "LEGACY_VALUE_INVALID", "P2032"],
    [new Error("COMMUNICATION_EMAIL_HISTORY_INCOMPLETE"), "SCAN_INCOMPLETE", null],
    [{ code: "P1001" }, "DATABASE_UNAVAILABLE", "P1001"],
    [{ code: "token=private", message: "private" }, "READ_FAILED", null],
  ] as const) {
    await assert.rejects(readAttributionStage("DONATIONS", async () => { throw cause; }), error => {
      assert.deepEqual(campaignAttributionDiagnostic(error), { stage: "DONATIONS", reason, code }); return true;
    });
  }
  assert.deepEqual(campaignAttributionDiagnostic(null), { stage: "REPORT", reason: "READ_FAILED", code: null });
});
