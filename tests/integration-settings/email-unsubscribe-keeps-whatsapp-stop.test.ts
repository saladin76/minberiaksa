import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s = fs.readFileSync("lib/communication/email-suppression.ts", "utf8");
test("an e-mail unsubscribe never erases a WhatsApp STOP; e-mail is still switched off", () => {
  assert.match(s, /const keepsWhatsappStop = current\?\.consentSource === "meta-whatsapp-inbound-opt-out";/);
  assert.match(s, /\.\.\.\(keepsWhatsappStop \? \{\} : \{ consentSource: `elastic-email:\$\{reason\}` \}\),/);
  assert.match(s, /emailOptIn: false,/);
});
