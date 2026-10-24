import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { retryPayloadBlockReason } from "../../lib/communication/retry-readiness";
import { partitionRetryIds, RETRY_BATCH_CAP } from "../../lib/communication/retry-batches";

const read = (file: string) => readFileSync(file, "utf8");

test("retry readiness requires an archived body or WhatsApp template snapshot", () => {
  assert.equal(retryPayloadBlockReason({ channel: "WHATSAPP", templateId: "tpl", variables: { snapshot: {} } }), null);
  assert.equal(retryPayloadBlockReason({ channel: "WHATSAPP", templateId: "tpl", variables: null }), "NO_RENDERED_BODY");
  assert.equal(retryPayloadBlockReason({ channel: "WHATSAPP", templateId: null, variables: { snapshot: {} } }), "NO_RENDERED_BODY");
  assert.equal(retryPayloadBlockReason({ channel: "EMAIL", renderedBody: "<p>receipt</p>" }), null);
  assert.equal(retryPayloadBlockReason({ channel: "EMAIL", renderedBody: null }), "NO_RENDERED_BODY");
  assert.equal(retryPayloadBlockReason({ channel: "SMS", renderedBody: "receipt" }), null);
  assert.equal(retryPayloadBlockReason({ channel: "SMS", renderedBody: "  " }), "NO_RENDERED_BODY");
});

test("one confirmed retry plan is partitioned into capped batches without losing or repeating candidates", () => {
  const ids = Array.from({ length: 57 }, (_, i) => `delivery-${i}`);
  const batches = partitionRetryIds([...ids, ids[0]], 25);
  assert.deepEqual(batches.map((batch) => batch.length), [25, 25, 7]);
  assert.equal(RETRY_BATCH_CAP, 25);
  assert.deepEqual(batches.flat(), ids);
  assert.deepEqual(partitionRetryIds([], 25), []);
});

test("a retry launched inside a campaign keeps the campaign scope from preflight through send", () => {
  const retryService = read("lib/communication/delivery-retry-service.ts");
  const retryRoute = read("app/api/dashboard/communication/deliveries/retry/route.ts");
  const dialog = read("app/(dashboard)/dashboard/communication/_shared/RetryDialog.tsx");
  const whatsappPage = read("app/(dashboard)/dashboard/communication/whatsapp/_components/WhatsappChannelDashboard.tsx");

  assert.match(retryService, /filter\.campaignId \? \{ campaignId: filter\.campaignId \}/);
  assert.match(retryRoute, /searchParams\.get\("campaign"\)/);
  assert.match(retryRoute, /campaignId, purposeGroup, \.\.\.range/);
  assert.match(retryRoute, /parsePostedRange\(body\.range, campaignId \? undefined : body\.days\)/);
  assert.match(dialog, /params\.set\("campaign", campaignId\)/);
  assert.match(dialog, /campaignId: campaignId \|\| undefined/);
  assert.match(dialog, /cursor = nextCursor/);
  assert.match(dialog, /if \(!isBulk \|\| !batchHasMore\) break/);
  assert.match(retryService, /candidateIds: readyRows\.map\(\(row\) => row\.id\)/);
  assert.match(whatsappPage, /campaignId=\{campaignId \|\| null\}/);
});

test("campaign-scoped retry counts and campaign report controls use the full campaign period", () => {
  const whatsappApi = read("app/api/dashboard/communication/whatsapp/route.ts");
  const whatsappPage = read("app/(dashboard)/dashboard/communication/whatsapp/_components/WhatsappChannelDashboard.tsx");
  assert.match(whatsappApi, /retryPreflight\(\{ channel: "WHATSAPP", purposeGroup, campaignId: campaignId \|\| undefined/);
  assert.match(whatsappPage, /badge=\{campaignId \? dt\("إجمالي الحملة"\)/);
  assert.match(whatsappPage, /dt\("مدة الحملة كاملة"\)/);
});

test("skipped campaign rows retain safe contact context and the preview does not infer missing contact", () => {
  const recipientService = read("lib/communication/campaign-recipient-service.ts");
  const executor = read("lib/communication/campaign-send-executor.ts");
  const preview = read("app/(dashboard)/dashboard/communication/_shared/DeliveryPreviewSheet.tsx");
  assert.match(recipientService, /name: member\.name, email: member\.email, phone: member\.phone/);
  assert.match(executor, /recipientPhone: channel !== "EMAIL" \? skipped\.phone : null/);
  assert.match(preview, /لا توجد بيانات اتصال محفوظة في سجل هذه المحاولة/);
  assert.doesNotMatch(preview, /لا يوجد عنوان مسجّل/);
});
