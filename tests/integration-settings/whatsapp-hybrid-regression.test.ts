import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("automatic Utility/Auth WhatsApp keeps Direct Send primary with approved-template fallback", () => {
  const source = read("lib/communication/automatic-message-dispatcher.ts");
  const direct = source.indexOf("sendDirectTextMessage");
  const fallback = source.indexOf("input.metaTemplate");
  assert.ok(direct >= 0, "automatic dispatcher must keep the Direct Send path");
  assert.ok(fallback >= 0, "automatic dispatcher must keep the Meta template fallback");
  assert.ok(direct < fallback, "Direct Send must be attempted before template fallback");
  assert.match(source, /META_WHATSAPP_DIRECT_SEND_ENABLED/);
  assert.match(source, /authentication/);
  assert.match(source, /utility/);
});

test("one-to-one WhatsApp preserves the 24h free-form path and separates Utility from Marketing", () => {
  const source = read("lib/communication/smart-whatsapp-service.ts");
  assert.match(source, /replyWindow\.open/);
  assert.match(source, /FREEFORM/);
  assert.match(source, /UTILITY/);
  assert.match(source, /MARKETING/);
  assert.match(source, /WHATSAPP_MARKETING_OPT_IN_REQUIRED/);
  assert.match(source, /UTILITY_TEMPLATE_FALLBACK/);
  assert.match(source, /MARKETING_TEMPLATE/);
});

test("smart WhatsApp remains an extension of the existing conversation and sender-routing stack", () => {
  const source = read("lib/communication/smart-whatsapp-service.ts");
  assert.match(source, /sendConversationReply/);
  assert.match(source, /replyWindowFor/);
  assert.match(source, /loadSenderRoutingSnapshot/);
  assert.match(source, /resolveSenderFromSnapshot/);
  assert.match(source, /createDeliveryRecord/);
  assert.match(source, /markDeliveryStatus/);
  assert.match(source, /writeAuditLog/);
});

test("campaign sending keeps pause, quiet hours, daily cap, speed controls and resumable delivery", () => {
  const controls = read("lib/communication/campaign-send-controls.ts");
  const executor = read("lib/communication/campaign-send-executor.ts");

  assert.match(controls, /paused/);
  assert.match(controls, /quietHours/);
  assert.match(controls, /dailyCap/);
  assert.match(controls, /SAFE/);
  assert.match(controls, /BALANCED/);
  assert.match(controls, /FAST/);
  assert.match(controls, /MAX/);

  assert.match(executor, /sendProgress/);
  assert.match(executor, /sendLease/);
  assert.match(executor, /ALREADY_PROCESSED/);
  assert.match(executor, /RESUME/);
  assert.match(executor, /runDueCampaigns/);
});

test("WhatsApp campaigns continue to use Meta-approved language/category truth before send", () => {
  const executor = read("lib/communication/campaign-send-executor.ts");
  assert.match(executor, /resolveVariantForLocale/);
  assert.match(executor, /META_TEMPLATE_CATEGORY_MISMATCH/);
  assert.match(executor, /readiness\.providerTemplateName/);
  assert.match(executor, /readiness\.languageCode/);
});

test("dashboard keeps the simple operator-facing Smart WhatsApp flow", () => {
  const dialog = read("components/dashboard/SmartWhatsappDialog.tsx");
  assert.match(dialog, /رد مباشر/);
  assert.match(dialog, /رسالة خدمة/);
  assert.match(dialog, /رسالة تسويقية/);
  assert.match(dialog, /سجل المحادثة/);
  assert.match(dialog, /Direct Send/);
  assert.match(dialog, /Utility/);
  assert.match(dialog, /Marketing/);
});


test("campaign progress updates preserve live send controls through compare-and-swap", () => {
  const store = read("lib/communication/campaign-metadata-store.ts");
  const executor = read("lib/communication/campaign-send-executor.ts");
  const controlsRoute = read("app/api/communication/campaigns/[id]/controls/route.ts");

  assert.match(store, /updatedAt/);
  assert.match(store, /updateMany/);
  assert.match(store, /expectedStatus/);
  assert.match(executor, /mergeCampaignMetadata/);
  assert.match(executor, /mutateCampaignMetadata/);
  assert.match(executor, /CLAIM_CONFLICT/);
  assert.match(executor, /expectedStatus: "SENDING"/);
  assert.match(controlsRoute, /mutateCampaignMetadata/);
});

test("campaign resume lease is claimed atomically and cannot overwrite cancellation", () => {
  const executor = read("lib/communication/campaign-send-executor.ts");

  assert.match(executor, /leaseClaimed/);
  assert.match(executor, /leaseIsFresh\(currentLease\)/);
  assert.match(executor, /return null/);
  assert.match(executor, /expectedStatus: "SENDING"/);
  assert.match(executor, /never overwrite concurrent campaign cancellation|Concurrent/i);
});


test("PayFor success keeps donation notification dispatch alive after redirect", () => {
  const route = read("app/api/payfor/3dpay/ok/route.ts");
  assert.match(route, /import \{ after, NextRequest, NextResponse \} from "next\/server"/);
  assert.match(route, /after\(\(\) => dispatchDonationPaid\(donationId\)\)/);
  assert.doesNotMatch(route, /void dispatchDonationPaid\(donationId\)/);
});

test("automatic donation dispatch is observable and recoverable after interruption", () => {
  const source = read("lib/events/dispatch.ts");
  assert.match(source, /DISPATCH_CLAIM_LEASE_MS/);
  assert.match(source, /state: "IN_PROGRESS"/);
  assert.match(source, /state: "COMPLETED"/);
  assert.match(source, /EVENT_DISPATCH_NO_TRIGGERS/);
  assert.match(source, /skipReasons/);
  assert.match(source, /META_DIRECT_SEND_OR_TEMPLATE_REQUIRED|sendTriggerMessage/);
});


test("advanced campaign controls include auto speed, scheduled stop, priority, and emergency gating", () => {
  const controls = read("lib/communication/campaign-send-controls.ts");
  const route = read("app/api/communication/campaigns/[id]/controls/route.ts");
  const executor = read("lib/communication/campaign-send-executor.ts");
  const ui = read("app/(dashboard)/dashboard/communication/campaigns/_components/CampaignControlsDialog.tsx");

  assert.match(controls, /autoSpeedMode/);
  assert.match(controls, /scheduledStopAt/);
  assert.match(controls, /resumeAt/);
  assert.match(controls, /campaignPriorityRank/);
  assert.match(controls, /COMMUNICATION_CAMPAIGN_EMERGENCY_STOP/);
  assert.match(controls, /SCHEDULED_STOP/);
  assert.match(executor, /campaignPriorityRank/);
  assert.match(executor, /autoSpeedMode/);
  assert.match(route, /priority: z\.enum\(\["LOW", "NORMAL", "HIGH", "URGENT"\]\)/);
  assert.match(route, /resumeAt/);
  assert.match(ui, /Auto Speed/);
  assert.match(ui, /توقف واستئناف مجدول/);
  assert.match(ui, /أولوية الحملة/);
});

test("advanced campaign controls keep restart windows sane", () => {
  const route = read("app/api/communication/campaigns/[id]/controls/route.ts");
  assert.match(route, /resume <= stop/);
  assert.match(route, /وقت الاستئناف يجب أن يكون بعد وقت التوقف/);
});


test("global campaign emergency stop is persisted, admin-only, and enforced before sends", () => {
  const schema = read("prisma/schema.prisma");
  const controls = read("lib/communication/campaign-send-controls.ts");
  const route = read("app/api/communication/campaigns/global-controls/route.ts");
  const actions = read("app/(dashboard)/dashboard/communication/campaigns/_components/CampaignRowActions.tsx");

  assert.match(schema, /model CommunicationGlobalControl/);
  assert.match(controls, /communicationGlobalControl\.findUnique/);
  assert.match(controls, /communicationGlobalControl\.upsert/);
  assert.match(controls, /EMERGENCY_STOP/);
  assert.match(route, /requireAdminSession/);
  assert.match(route, /EMERGENCY_STOP_ENV_LOCK/);
  assert.match(actions, /EMERGENCY_STOP/);
  assert.match(actions, /SCHEDULED_STOP/);
});


test("WhatsApp campaign creation configures send controls before the campaign row is created", () => {
  const wizard = read("app/(dashboard)/dashboard/communication/campaigns/new/_components/NewCampaignWizard.tsx");
  const route = read("app/api/communication/campaigns/route.ts");

  assert.match(wizard, /"التحكم"/);
  assert.match(wizard, /التالي: إعداد الإرسال/);
  assert.match(wizard, /sendControls/);
  assert.match(route, /sendControlsSchema/);
  assert.match(route, /metadata: \{ sendControls \}/);
});

test("campaign controls dialog stays scrollable and cannot bubble clicks into the campaign row", () => {
  const dialog = read("app/(dashboard)/dashboard/communication/campaigns/_components/CampaignControlsDialog.tsx");
  assert.match(dialog, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(dialog, /overflow-y-auto/);
  assert.match(dialog, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(dialog, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
});


test("WhatsApp inbox defaults to all conversations and remembers an available sender", () => {
  const inbox = read("app/(dashboard)/dashboard/communication/inbox/_components/WhatsappInbox.tsx");
  assert.match(inbox, /useState\("all"\)/);
  assert.match(inbox, /communication:whatsapp:senderId/);
  assert.match(inbox, /nextSenders\.length === 1/);
  assert.match(inbox, /setActiveId\(nextConversations\[0\]\.id\)/);
  assert.match(inbox, /عرض كل المحادثات/);
});

test("WhatsApp inbox exposes the greeting-template re-entry path outside the 24-hour window", () => {
  const inbox = read("app/(dashboard)/dashboard/communication/inbox/_components/WhatsappInbox.tsx");
  const smart = read("components/dashboard/SmartWhatsappDialog.tsx");
  assert.match(inbox, /إرسال قالب تحية/);
  assert.match(inbox, /initialMode=\{smartInitialMode\}/);
  assert.match(smart, /initialMode\?: "FREEFORM" \| "UTILITY" \| "MARKETING"/);
  assert.match(smart, /preferred === "MARKETING"/);
});

test("dashboard topbar makes unanswered WhatsApp conversations visually prominent", () => {
  const topbar = read("app/(dashboard)/dashboard/_shell/DashboardTopbar.tsx");
  const layout = read("app/(dashboard)/dashboard/DashboardLayoutClient.tsx");
  assert.match(layout, /filter=needsReply/);
  assert.match(layout, /setInterval\(run, 30000\)/);
  assert.match(topbar, /بانتظار رد/);
  assert.match(topbar, /animate-ping/);
  assert.match(topbar, /whatsappInboxCount > 99 \? "99\+" : whatsappInboxCount/);
});

test("campaign wizard never assumes an error response is JSON", () => {
  const wizard = read("app/(dashboard)/dashboard/communication/campaigns/new/_components/NewCampaignWizard.tsx");
  assert.match(wizard, /async function readApiJson/);
  assert.match(wizard, /await response\.text\(\)/);
  assert.match(wizard, /HTTP \$\{response\.status\}/);
  assert.doesNotMatch(wizard, /const listJson = await listRes\.json\(\)/);
  assert.doesNotMatch(wizard, /const json = await res\.json\(\)/);
});
