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
test("one-to-one WhatsApp keeps reply-window and explicit-stop checks without an opt-in gate", () => {
  requires("lib/communication/smart-whatsapp-service.ts", [/replyWindow\.open/, /FREEFORM/, /UTILITY/, /MARKETING/, /whatsappUnsubscribed/, /checkWhatsappRecipientStop/], [/WHATSAPP_OPT_IN_REQUIRED/, /!ctx\.whatsappOptIn/]);
});
test("smart WhatsApp remains an extension of the existing conversation and sender-routing stack", () => {
  requires("lib/communication/smart-whatsapp-service.ts", [/sendConversationReply/, /replyWindowFor/, /loadSenderRoutingSnapshot/, /resolveSenderFromSnapshot/, /createDeliveryRecord/, /markDeliveryStatus/, /writeAuditLog/]);
});
test("campaign sending keeps pause, quiet hours, daily cap, speed controls and resumable delivery", () => {
  requires(controlsPath, [/paused/, /quietHours/, /dailyCap/, /SAFE/, /BALANCED/, /FAST/, /MAX/]);
  requires(executorPath, [/sendProgress/, /sendLease/, /ALREADY_PROCESSED/, /RESUME/, /runDueCampaigns/]);
});
test("WhatsApp interval control is visible and defaults to unlimited sending", () => {
  requires("app/(dashboard)/dashboard/communication/campaigns/_components/CampaignRowActions.tsx", [/إعدادات الإرسال/, /canControl/, /CampaignControlsDialog/]);
  requires("app/(dashboard)/dashboard/communication/campaigns/_components/CampaignControlsDialog.tsx", [/whatsappMarketingCooldownDays: 0/, /min=\{0\}/, /اجعلها 0 للسماح بالإرسال دون فاصل/]);
  requires(controlsPath, [/DEFAULT_WHATSAPP_MARKETING_COOLDOWN_DAYS = 0/, /whatsappMarketingCooldownConfigured/]);
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
  requires(inboxPath, [/useState\("all"\)/, /communication:whatsapp:senderId/, /nextSenders\.length === 1/, /nextConversations\[0\]\.id/, /selectConversation\(nextConversations\[0\]\.id\)/, /عرض كل المحادثات/]);
});
test("WhatsApp inbox exposes the greeting-template re-entry path outside the 24-hour window", () => {
  requires(inboxPath, [/إرسال قالب تحية/, /initialMode=\{smartInitialMode\}/]);
  requires(smartDialog, [/initialMode\?: "FREEFORM" \| "UTILITY" \| "MARKETING"/, /const preferred = initialMode/, /setMode\(preferred\)/]);
});
test("dashboard topbar makes unread WhatsApp conversations visually prominent", () => {
  requires("app/(dashboard)/dashboard/DashboardLayoutClient.tsx", [/filter=unread/, /setInterval\(run, 30000\)/]);
  requires("app/(dashboard)/dashboard/_shell/DashboardTopbar.tsx", [/href="\/dashboard\/communication\/inbox"/, /WhatsappMark/, /whatsappInboxCount > 99 \? "99\+" : whatsappInboxCount/, /href="\/dashboard\/inbox"/]);
  requires("lib/dashboard/nav-config.ts", [], [/href: "\/dashboard\/communication\/inbox"/, /href: "\/dashboard\/inbox"/]);
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
test("WhatsApp sends have no donor opt-in form and retain the recipient STOP check", () => {
  requires("lib/communication/campaign-audience-accounting.ts", [/isWhatsappExplicitlyUnsubscribed/, /meta-whatsapp-inbound-opt-out/], [/profile\.whatsappOptIn !== true/]);
  requires(smartDialog, [/whatsappUnsubscribed/], [/WHATSAPP_OPT_IN_REQUIRED/, /whatsappOptIn/, /تسجيل الموافقة/]);
});
test("campaign membership stays separate from consent and is rechecked before provider calls", () => {
  requires("lib/communication/audience-service.ts", [/recipientExclusionReason\(donor, channel, profile\)/]);
  requires("lib/communication/campaign-audience-accounting.ts", [/const value = preview\.matched/, /isWhatsappExplicitlyUnsubscribed/, /profile\?\.doNotContact === true/], [/profile\.whatsappOptIn !== true/]);
  requires("lib/communication/campaign-recipient-guard.ts", [/prisma\.user\.findUnique/, /CONSENT_CHECK_UNAVAILABLE/]);
  const executor = read(executorPath);
  const checkAt = executor.indexOf("await checkCampaignRecipientBeforeSend"), sendAt = executor.indexOf("await sendPreparedDelivery");
  assert.ok(checkAt >= 0 && sendAt > checkAt);
  requires("lib/communication/smart-whatsapp-service.ts", [/checkWhatsappRecipientStop/], [/mode !== "FREEFORM" && !ctx\.whatsappOptIn/]);
  requires(smartDialog, [/whatsappUnsubscribed/], [/mode !== "FREEFORM" && !ctx\.whatsappOptIn/]);
  requires("lib/communication/retry-recipient-guard.ts", [/isWhatsappExplicitlyUnsubscribed/], [/channel === "WHATSAPP" && profile\?\.whatsappOptIn !== true/]);
});
