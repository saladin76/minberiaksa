import assert from "node:assert/strict";
import test from "node:test";
import {
  hasWhatsappUnsubscribeQuickReply,
  isWhatsappUnsubscribeQuickReply,
  whatsappUnsubscribeCopy,
} from "../../lib/communication/whatsapp-template-unsubscribe";

test("unsubscribe language recognizes Arabic, Turkish and English STOP replies", () => {
  for (const text of ["STOP", " Stop! ", "Dur", "إيقاف", "الغاء الاشتراك"]) {
    assert.equal(isWhatsappUnsubscribeQuickReply(text), true);
  }
  for (const text of ["Continue", "موافق", "Başla"]) {
    assert.equal(isWhatsappUnsubscribeQuickReply(text), false);
  }
});

test("only a quick-reply button satisfies the required unsubscribe control", () => {
  assert.equal(hasWhatsappUnsubscribeQuickReply([{ type: "QUICK_REPLY", text: "إيقاف" }]), true);
  assert.equal(hasWhatsappUnsubscribeQuickReply([{ type: "URL", text: "Stop" }]), false);
  assert.equal(hasWhatsappUnsubscribeQuickReply([{ type: "QUICK_REPLY", text: "Continue" }]), false);
  assert.equal(hasWhatsappUnsubscribeQuickReply(null), false);
});

test("marketing templates get clear localized unsubscribe copy", () => {
  assert.match(whatsappUnsubscribeCopy("ar").footer, /إلغاء الاشتراك/);
  assert.match(whatsappUnsubscribeCopy("tr").footer, /STOP/);
  assert.match(whatsappUnsubscribeCopy("en").footer, /Stop|STOP/);
});
