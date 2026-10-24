import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isCampaignControlTerminalStatus } from "../../lib/communication/communication-runtime-types";

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
  assert.match(actions, /campaign\.channel === "WHATSAPP" && !isCampaignControlTerminalStatus\(campaign\.status\)/);
  assert.match(route, /if \(isCampaignControlTerminalStatus\(campaign\.status\)\)/);
});
