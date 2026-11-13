import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isCampaignControlTerminalStatus, isResumableBlockedCampaign } from "../../lib/communication/communication-runtime-types";

test("completed campaign statuses cannot expose pause controls", () => {
  for (const status of ["SENT", "SENT_WITH_ISSUES", "BLOCKED", "CANCELLED", "FAILED", "ARCHIVED"]) {
    assert.equal(isCampaignControlTerminalStatus(status), true, `${status} must be terminal`);
  }
  for (const status of ["DRAFT", "REVIEW", "APPROVED", "SCHEDULED", "SENDING"]) {
    assert.equal(isCampaignControlTerminalStatus(status), false, `${status} must remain controllable`);
  }
});

test("campaign rows show sent-with-issues accurately and hide controls for terminal states", () => {
  const ui = readFileSync("app/(dashboard)/dashboard/communication/campaigns/_components/campaign-ui.ts", "utf8");
  const actions = readFileSync("app/(dashboard)/dashboard/communication/campaigns/_components/CampaignRowActions.tsx", "utf8");
  const route = readFileSync("app/api/communication/campaigns/[id]/controls/route.ts", "utf8");
  assert.match(ui, /SENT_WITH_ISSUES:\s*\{\s*get label\(\)\s*\{\s*return dt\("تم الإرسال مع إخفاقات"\)/);
  assert.match(ui, /BLOCKED:\s*\{\s*get label\(\)\s*\{\s*return dt\("تعذّر استكمال الإرسال"\)/);
  assert.match(ui, /statusMeta = \(s: string\) => STATUS_META\[s\] \?\? \{/);
  assert.match(actions, /isCampaignControlTerminalStatus\(campaign\.status\).*isResumableBlockedCampaign\(campaign\)/);
  assert.match(route, /isCampaignControlTerminalStatus\(campaign\.status\) && !isResumableBlockedCampaign\(campaign\)/);
  assert.equal(isResumableBlockedCampaign({ status: "BLOCKED", metadata: { sendProgress: { done: false } } }), true);
  for (const campaign of [{ status: "BLOCKED" }, { status: "BLOCKED", metadata: { sendProgress: { done: true } } }, { status: "CANCELLED", metadata: { sendProgress: { done: false } } }]) assert.equal(isResumableBlockedCampaign(campaign), false);
});

test("sending confirmation remains mounted during async request and cannot double dispatch", () => {
  const actions = readFileSync("app/(dashboard)/dashboard/communication/campaigns/_components/CampaignRowActions.tsx", "utf8");
  const send = actions.slice(actions.indexOf("  const send = async () =>"), actions.indexOf("\\n  return (", actions.indexOf("  const send = async () =>")));
  assert.match(send, /if \(sendingRef\.current\) return;/);
  assert.match(send, /sendingRef\.current = true;/);
  assert.doesNotMatch(send.slice(0, send.indexOf("    try {")), /setConfirmOpen\(false\)/);
  assert.match(send, /finally \{[\s\S]*?sendingRef\.current = false;[\s\S]*?setConfirmOpen\(false\)/);
  assert.match(actions, /onOpenChange=\{open => \{ if \(!sendingRef\.current\) setConfirmOpen\(open\); \}\}/);
  assert.match(actions, /<AlertDialogCancel disabled=\{busy\}>/);
  assert.match(actions, /onClick=\{event => \{ event\.preventDefault\(\); void send\(\); \}\}/);
});
