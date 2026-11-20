import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s = fs.readFileSync("lib/communication/webhook-service.ts", "utf8");
test("Meta 131050 (marketing stopped inside WhatsApp) is recorded as a WhatsApp STOP, fail-safe", () => {
  assert.match(s, /event\.status === "FAILED" && \/\\b131050\\b\/\.test\(String\(event\.errorMessage \?\? ""\)\)/);
  assert.match(s, /data: \{ consentSource: "meta-whatsapp-inbound-opt-out", lastConsentAt: new Date\(\) \}/);
  assert.match(s, /\.catch\(\(\) => \{ summary\.persistenceErrors \+= 1; \}\);/);
});
