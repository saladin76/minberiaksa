import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
function requires(path: string, patterns: RegExp[], forbidden: RegExp[] = []) {
  const source = read(path);
  for (const pattern of patterns) assert.match(source, pattern);
  for (const pattern of forbidden) assert.doesNotMatch(source, pattern);
  return source;
}
const executorPath = "lib/communication/campaign-send-executor.ts";
const controlsPath = "lib/communication/campaign-send-controls.ts";
const controlsRoute = "app/api/communication/campaigns/[id]/controls/route.ts";
const inboxPath = "app/(dashboard)/dashboard/communication/inbox/_components/WhatsappInbox.tsx";
const smartDialog = "components/dashboard/SmartWhatsappDialog.tsx";

test("automatic Utility/Auth WhatsApp keeps Direct Send primary with approved-template fallback", () => {
  const source = requires("lib/communication/automatic-message-dispatcher.ts", [/META_WHATSAPP_DIRECT_SEND_ENABLED/, /authentication/, /utility/]);
  const direct = source.indexOf("sendDirectTextMessage"), fallback = source.indexOf("input.metaTemplate");
  assert.ok(direct >= 0 && fallback >= 0 && direct < fallback);
});
test("one-to-one WhatsApp preserves the 24h free-form path and separates Utility from Marketing", () => {
  requires("lib/communication/smart-whatsapp-service.ts", [/replyWindow\.open/, /FREEFORM/, /UTILITY/, /MARKETING/, /UTILITY_TEMPLATE_FALLBACK/, /MARKETING_TEMPLATE/], [/WHATSAPP_MARKETING_OPT_IN_REQUIRED/]);
});
test("smart WhatsApp remains an extension of the existing conversation and sender-routing stack", () => {
  requires("lib/communication/smart-whatsapp-service.ts", [/sendConversationReply/, /replyWindowFor/, /loadSenderRoutingSnapshot/, /resolveSenderFromSnapshot/, /createDeliveryRecord/, /markDeliveryStatus/, /writeAuditLog/]);
});
test("campaign sending keeps pause, quiet hours, daily cap, speed controls and resumable delivery", () => {
  requires(controlsPath, [/paused/, /quietHours/, /dailyCap/, /SAFE/, /BALANCED/, /FAST/, /MAX/]);
  requires(executorPath, [/sendProgress/, /sendLease/, /ALREADY_PROCESSED/, /RESUME/, /runDueCampaigns/]);
});
test("WhatsApp campaigns continue to use Meta-approved language/category truth before send", () => {
  requires(executorPath, [/resolveVariantForLocale/, /META_TEMPLATE_CATEGORY_MISMATCH/, /readiness\.providerTemplateName/, /readiness\.languageCode/]);
});
test("dashboard keeps the simple operator-facing Smart WhatsApp flow", () => {
  requires(smartDialog, [/رد مباشر/, /رسالة خدمة/, /رسالة تسويقية/, /سجل المحادثة/, /Direct Send/, /Utility/, /Marketing/]);
});
test("campaign progress updates preserve live send controls through compare-and-swap", () => {
  requires("lib/communication/campaign-metadata-store.ts", [/updatedAt/, /updateMany/, /expectedStatus/]);
  requires(executorPath, [/mergeCampaignMetadata/, /mutateCampaignMetadata/, /CLAIM_CONFLICT/, /expectedStatus: "SENDING"/]);
  requires(controlsRoute, [/mutateCampaignMetadata/]);
});
test("campaign resume lease is claimed atomically and cannot overwrite cancellation", () => {
  requires(executorPath, [/leaseClaimed/, /leaseIsFresh\(currentLease\)/, /return null/, /expectedStatus: "SENDING"/, /never overwrite concurrent campaign cancellation|Concurrent/i]);
});
test("PayFor success keeps donation notification dispatch alive after redirect", () => {
  requires("app/api/payfor/3dpay/ok/route.ts", [/import \{ after, NextRequest, NextResponse \} from "next\/server"/, /after\(\(\) => dispatchDonationPaid\(donationId\)\)/], [/void dispatchDonationPaid\(donationId\)/]);
});
test("automatic donation dispatch is observable and recoverable after interruption", () => {
  requires("lib/events/dispatch.ts", [/DISPATCH_CLAIM_LEASE_MS/, /state: "IN_PROGRESS"/, /state: "COMPLETED"/, /EVENT_DISPATCH_NO_TRIGGERS/, /skipReasons/, /META_DIRECT_SEND_OR_TEMPLATE_REQUIRED|sendTriggerMessage/]);
});
test("advanced campaign controls include auto speed, scheduled stop, priority, and emergency gating", () => {
  requires(controlsPath, [/autoSpeedMode/, /scheduledStopAt/, /resumeAt/, /campaignPriorityRank/, /COMMUNICATION_CAMPAIGN_EMERGENCY_STOP/, /SCHEDULED_STOP/]);
  requires(executorPath, [/campaignPriorityRank/, /autoSpeedMode/]);
  requires(controlsRoute, [/priority: z\.enum\(\["LOW", "NORMAL", "HIGH", "URGENT"\]\)/, /resumeAt/]);
  requires("app/(dashboard)/dashboard/communication/campaigns/_components/CampaignControlsDialog.tsx", [/Auto Speed/, /توقف واستئناف مجدول/, /أولوية الحملة/]);
});
test("advanced campaign controls keep restart windows sane", () => {
  requires(controlsRoute, [/resume <= stop/, /وقت الاستئناف يجب أن يكون بعد وقت التوقف/]);
});
test("global campaign emergency stop is persisted, admin-only, and enforced before sends", () => {
  requires("prisma/schema.prisma", [/model CommunicationGlobalControl/]);
  requires(controlsPath, [/communicationGlobalControl\.findUnique/, /communicationGlobalControl\.upsert/, /EMERGENCY_STOP/]);
  requires("app/api/communication/campaigns/global-controls/route.ts", [/requireAdminSession/, /EMERGENCY_STOP_ENV_LOCK/]);
  requires("app/(dashboard)/dashboard/communication/campaigns/_components/CampaignRowActions.tsx", [/EMERGENCY_STOP/, /SCHEDULED_STOP/]);
});
test("WhatsApp campaign creation configures send controls before the campaign row is created", () => {
  requires("app/(dashboard)/dashboard/communication/campaigns/new/_components/NewCampaignWizard.tsx", [/"التحكم"/, /التالي: إعداد الإرسال/, /sendControls/]);
  requires("app/api/communication/campaigns/route.ts", [/sendControlsSchema/, /metadata:/, /sendControls/, /fallbackLocale/]);
});
test("campaign controls dialog stays scrollable and cannot bubble clicks into the campaign row", () => {
  requires("app/(dashboard)/dashboard/communication/campaigns/_components/CampaignControlsDialog.tsx", [/max-h-\[calc\(100dvh-2rem\)\]/, /overflow-y-auto/, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/]);
});
test("WhatsApp inbox defaults to all conversations and remembers an available sender", () => {
  requires(inboxPath, [/useState\("all"\)/, /communication:whatsapp:senderId/, /nextSenders\.length === 1/, /nextConversations\[0\]\.id/, /setActiveId\(\(current\)/, /عرض كل المحادثات/]);
});
test("WhatsApp inbox exposes the greeting-template re-entry path outside the 24-hour window", () => {
  requires(inboxPath, [/إرسال قالب تحية/, /initialMode=\{smartInitialMode\}/]);
  requires(smartDialog, [/initialMode\?: "FREEFORM" \| "UTILITY" \| "MARKETING"/, /const preferred = initialMode/, /setMode\(preferred\)/]);
});
test("dashboard topbar makes unanswered WhatsApp conversations visually prominent", () => {
  requires("app/(dashboard)/dashboard/DashboardLayoutClient.tsx", [/filter=needsReply/, /setInterval\(run, 30000\)/]);
  requires("app/(dashboard)/dashboard/_shell/DashboardTopbar.tsx", [/بانتظار رد/, /animate-ping/, /whatsappInboxCount > 99 \? "99\+" : whatsappInboxCount/]);
});
test("campaign wizard never assumes an error response is JSON", () => {
  requires("app/(dashboard)/dashboard/communication/campaigns/new/_components/NewCampaignWizard.tsx", [/async function readApiJson/, /await response\.text\(\)/, /HTTP \$\{response\.status\}/], [/const listJson = await listRes\.json\(\)/, /const json = await res\.json\(\)/]);
});
test("campaign picker explains the shared eligibility policy without manufacturing consent", () => {
  requires("app/api/communication/audience-candidates/route.ts", [/eligibilityReason/, /recipientExclusionReason\(donor, channel, profile\)/, /RECIPIENT_REASON_LABELS\[reason\]/, /campaignCandidateWhere\(base, channel, eligibility, ids\)/, /await readCampaignConsentUserIds/], [/if \(channel === "WHATSAPP"\) return null/, /ensureProfilesForUsers|setProfileConsent/]);
  requires("app/(dashboard)/dashboard/communication/campaigns/new/_components/DonorPicker.tsx", [/eligibilityReason/, /async function readApiJson/], [/const json = await res\.json\(\)/]);
});
test("automatic-events list fails visibly instead of spinning forever", () => {
  requires("app/(dashboard)/dashboard/templates/_components/TriggerList.tsx", [/timeout: 15000/, /loadError/, /إعادة المحاولة/]);
});
test("campaign audience badge evaluation stays scoped to visible donors", () => {
  requires("lib/badge-criteria.ts", [/candidateUserIds\?: string\[\]/, /donorId: \{ in: candidateUserIds \}/, /getUserIdsMatchingBadge\(badge\.criteria, userIds\)/]);
});
test("Smart WhatsApp preserves the current consent surface without adding a new operator flow", () => {
  requires("app/api/dashboard/communication/whatsapp/smart-send/route.ts", [/consentSchema/, /dashboard-manual-whatsapp-confirmation/, /setProfileConsent/]);
  requires(smartDialog, [], [/تسجيل الموافقة/, /setMarketingConsent/]);
});
test("campaign membership stays separate from consent and is rechecked before provider calls", () => {
  requires("lib/communication/audience-service.ts", [/recipientExclusionReason\(donor, channel, profile\)/]);
  requires("lib/communication/campaign-audience-accounting.ts", [/channel === "WHATSAPP" \? preview\.matched : preview\.eligible/, /profile\.whatsappOptIn !== true/, /profile\?\.doNotContact === true/]);
  requires("lib/communication/campaign-recipient-guard.ts", [/prisma\.user\.findUnique/, /CONSENT_CHECK_UNAVAILABLE/]);
  const executor = read(executorPath);
  const checkAt = executor.indexOf("await checkCampaignRecipientBeforeSend"), sendAt = executor.indexOf("await sendPreparedDelivery");
  assert.ok(checkAt >= 0 && sendAt > checkAt);
  requires("lib/communication/smart-whatsapp-service.ts", [], [/WHATSAPP_MARKETING_OPT_IN_REQUIRED/]);
  requires(smartDialog, [], [/تسجيل الموافقة/]);
  requires("lib/communication/delivery-retry-service.ts", [/purpose !== "MARKETING" \|\| channel === "WHATSAPP"/]);
});
