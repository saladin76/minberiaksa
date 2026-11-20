import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p: string) => fs.readFileSync(p, "utf8");
const svc = read("lib/communication/conversation-template-service.ts");
const route = read("app/api/dashboard/communication/inbox/[id]/route.ts");
const page = read("app/(dashboard)/dashboard/communication/conversations/_components/ConversationsWorkspace.tsx");

test("same safeguards as a reply: do-not-contact first, the conversation's own number", () => {
  const fn = svc.slice(svc.indexOf("async function conversationSender"));
  assert.ok(fn.indexOf("doNotContact: true") > 0 && fn.indexOf("doNotContact: true") < fn.indexOf("await loadSenderRoutingSnapshot"), "do-not-contact is checked before the sender is resolved");
  assert.match(svc, /if \(senderId && !known\) return \{ ok: false, reason: "CONVERSATION_SENDER_NOT_FOUND" \}/);
});

test("the approved version in that number's account; refused when the template needs data a conversation lacks", () => {
  assert.match(svc, /resolveMetaTemplateMapping\(tpl, locale, sender\.businessAccountId\)/);
  assert.match(svc, /if \(!built\.ok\) return \{ ok: false, reason: "TEMPLATE_NEEDS_DATA"/);
  assert.match(svc, /origin: "MANUAL"/);
  assert.match(svc, /touchOutbound/);
});

test("the route loads the service on demand and the page offers the button only when the window is closed", () => {
  assert.match(route, /action: z\.literal\("template"\)/);
  assert.match(route, /await import\("@\/lib\/communication\/conversation-template-service"\)/);
  assert.match(page, /replyWindow && !replyWindow\.open \? \([\s\S]*?dt\("إرسال قالب معتمد"\)/);
  assert.match(page, /window\.confirm\(dt\("إرسال القالب «\{0\}» إلى \{1\}؟"/);
});

test("a donor who pressed STOP never receives a marketing template from a conversation", () => {
  assert.match(svc, /isWhatsappExplicitlyUnsubscribed\(row\)/, "the same STOP check as the campaigns");
  assert.doesNotMatch(svc, /whatsappOptIn: false/, "not the legacy flag, which is false for almost every donor");
  assert.match(svc, /if \(mapping\.category === "MARKETING" && await marketingOptedOut\(sender\.to\)\) return \{ ok: false, reason: "MARKETING_OPTED_OUT" \}/);
  assert.match(svc, /if \(mapping\.category === "MARKETING" && optedOut\) continue;/, "and is not offered in the list");
  assert.match(svc, /if \(rows === null\) return true;/, "an unreadable profile counts as opted out");
});
