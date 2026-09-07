import { prisma } from "@/lib/prisma";
import { getRawTrackingSettings, trackingString } from "@/lib/tracking/tracking-settings";
import { getSchedulerStatus, type SchedulerStatus } from "@/lib/communication/scheduler-status";
import { getActiveCommunicationRuntimeBundle, getActiveMetaWebhookConfig } from "@/lib/communication/runtime-config";
import { safeCountValue } from "@/lib/dashboard/safe-count";

export type ConnStatus = "READY" | "NEEDS_SETUP" | "FAILED" | "DISABLED";
export const STATUS_LABEL: Record<ConnStatus, string> = { READY: "جاهز", NEEDS_SETUP: "يحتاج إعداد", FAILED: "فشل آخر اختبار", DISABLED: "غير مفعّل" };
export const STATUS_CLASS: Record<ConnStatus, string> = { READY: "border-emerald-200 bg-emerald-50 text-emerald-700", NEEDS_SETUP: "border-amber-200 bg-amber-50 text-amber-700", FAILED: "border-rose-200 bg-rose-50 text-rose-700", DISABLED: "border-slate-200 bg-slate-100 text-slate-600" };
const env = (key: string) => !!process.env[key]?.trim();
const hasDb = () => !!process.env.DATABASE_URL;

export type PixelRow = { key: string; label: string; configured: boolean; browser: boolean; server: boolean; status: ConnStatus; note?: string };
export type TrackingReadiness = { status: ConnStatus; configuredCount: number; total: number; rows: PixelRow[] };
export async function getTrackingReadiness(): Promise<TrackingReadiness> {
  const row = hasDb() ? await getRawTrackingSettings().catch(() => null) : null;
  const setting = (key: string) => !!trackingString(row, key);
  const metaPixel = setting("facebookPixelId") || env("META_PIXEL_ID");
  const metaCapi = setting("facebookAccessToken") || env("META_ACCESS_TOKEN");
  const tiktokPixel = setting("tiktokPixelId");
  const tiktokApi = setting("tiktokAccessToken");
  const gaTag = setting("gaMeasurementId") || env("GA4_MEASUREMENT_ID");
  const ga4Server = gaTag && (setting("gaApiSecret") || env("GA4_API_SECRET"));
  const googleAds = setting("googleAdsConversionId");
  const xPixel = setting("xPixelId");
  const status = (ok: boolean): ConnStatus => ok ? "READY" : "NEEDS_SETUP";
  const rows: PixelRow[] = [
    { key: "meta_pixel", label: "Meta Pixel", configured: metaPixel, browser: true, server: false, status: status(metaPixel) },
    { key: "meta_capi", label: "Meta Conversions API", configured: metaCapi, browser: false, server: true, status: status(metaCapi) },
    { key: "tiktok_pixel", label: "TikTok Pixel", configured: tiktokPixel, browser: true, server: false, status: status(tiktokPixel) },
    { key: "tiktok_api", label: "TikTok Events API", configured: tiktokApi, browser: false, server: true, status: status(tiktokApi) },
    { key: "google_tag", label: "Google Tag", configured: gaTag, browser: true, server: false, status: status(gaTag) },
    { key: "ga4", label: "GA4", configured: !!ga4Server, browser: true, server: true, status: status(!!ga4Server) },
    { key: "google_ads", label: "Google Ads Conversion", configured: googleAds, browser: false, server: true, status: status(googleAds) },
    { key: "x_pixel", label: "X Pixel", configured: xPixel, browser: true, server: false, status: status(xPixel) },
  ];
  return { status: metaPixel && metaCapi ? "READY" : "NEEDS_SETUP", configuredCount: rows.filter((item) => item.configured).length, total: rows.length, rows };
}

const AD_PLATFORMS = [
  { key: "META", label: "Meta Ads", aliases: ["META", "FACEBOOK"] },
  { key: "GOOGLE_ADS", label: "Google Ads", aliases: ["GOOGLE_ADS"] },
  { key: "TIKTOK", label: "TikTok Ads", aliases: ["TIKTOK"] },
  { key: "X", label: "X Ads", aliases: ["X", "X_ADS", "TWITTER"] },
];
export type AdAccountRow = { key: string; label: string; connected: boolean; enabled: boolean; status: ConnStatus; completionPercent: number; lastSyncAt: string | null; lastSyncStatus: string | null; lastError: string | null };
export type AdAccountsReadiness = { status: ConnStatus; connectedCount: number; rows: AdAccountRow[] };
function mapConnectionStatus(connectionStatus: string | null, enabled: boolean, percent: number): ConnStatus {
  if (!enabled) return "DISABLED";
  if (connectionStatus && ["AUTH_ERROR", "PERMISSION_ERROR", "SYNC_ERROR"].includes(connectionStatus)) return "FAILED";
  if (connectionStatus === "ACTIVE" && percent >= 100) return "READY";
  return "NEEDS_SETUP";
}
export async function getAdAccountsReadiness(): Promise<AdAccountsReadiness> {
  let connections: Array<{ platform: string; enabled: boolean; status: string; lastSyncAt: Date | null; lastError: string | null; configChecklist: unknown }> = [];
  let syncRuns: Array<{ platform: string; status: string; startedAt: Date; error: string | null }> = [];
  if (hasDb()) {
    connections = await prisma.marketingPlatformConnection.findMany({ where: { category: "ADS" }, select: { platform: true, enabled: true, status: true, lastSyncAt: true, lastError: true, configChecklist: true } }).catch(() => []);
    syncRuns = await prisma.platformSyncRun.findMany({ orderBy: { startedAt: "desc" }, take: 40, select: { platform: true, status: true, startedAt: true, error: true } }).catch(() => []);
  }
  const rows = AD_PLATFORMS.map((platform): AdAccountRow => {
    const matches = connections.filter((connection) => platform.aliases.includes((connection.platform || "").toUpperCase()));
    const enabled = matches.some((connection) => connection.enabled);
    const percent = Math.max(0, ...matches.map((connection) => Number((connection.configChecklist as { completionPercent?: number } | null)?.completionPercent ?? 0)));
    const primary = matches.find((connection) => connection.enabled) ?? matches[0];
    const lastRun = syncRuns.find((run) => platform.aliases.includes((run.platform || "").toUpperCase()));
    return { key: platform.key, label: platform.label, connected: matches.length > 0, enabled, status: matches.length ? mapConnectionStatus(primary?.status ?? null, enabled, percent) : "NEEDS_SETUP", completionPercent: percent, lastSyncAt: (lastRun?.startedAt ?? primary?.lastSyncAt)?.toISOString() ?? null, lastSyncStatus: lastRun?.status ?? null, lastError: primary?.lastError ?? lastRun?.error ?? null };
  });
  const connectedCount = rows.filter((item) => item.connected).length;
  return { status: rows.some((item) => item.status === "READY") ? "READY" : rows.some((item) => item.status === "FAILED") ? "FAILED" : "NEEDS_SETUP", connectedCount, rows };
}

export type CommunicationReadiness = {
  status: ConnStatus;
  whatsapp: { status: ConnStatus; sendersWithNumber: number; sendersMissingNumber: number };
  email: { status: ConnStatus; envConfigured: boolean; enabledSenders: number };
  sms: { status: ConnStatus };
  routingRules: number;
  scheduler: SchedulerStatus;
};
function runtimeStatus(config: { configured: boolean; enabled: boolean; reason: string | null }): ConnStatus {
  if (!config.enabled) return "DISABLED";
  if (config.reason === "INTEGRATION_DECRYPTION_FAILED") return "FAILED";
  return config.configured ? "READY" : "NEEDS_SETUP";
}
export async function getCommunicationReadiness(): Promise<CommunicationReadiness> {
  const [runtime, scheduler] = await Promise.all([getActiveCommunicationRuntimeBundle(), getSchedulerStatus()]);
  let sendersWithNumber = 0;
  let sendersMissingNumber = 0;
  let enabledEmailSenders = 0;
  let routingRules = 0;
  if (hasDb()) {
    [sendersWithNumber, sendersMissingNumber, enabledEmailSenders, routingRules] = await Promise.all([
      safeCountValue("readiness.whatsappWithNumber", () => prisma.communicationSender.count({ where: { channel: "WHATSAPP", phoneNumberId: { not: null } } })),
      // `phoneNumberId: null` alone matches only an EXPLICIT null — in MongoDB a field that
      // was never written is absent, not null, so a sender created without a number would be
      // missed and "senders missing a number" would under-report. See §1.5 of
      // docs/dashboard-completion-roadmap.md. Latent today (0 WhatsApp senders exist), which
      // is exactly when it is cheap to fix.
      safeCountValue("readiness.whatsappMissingNumber", () =>
        prisma.communicationSender.count({
          where: { channel: "WHATSAPP", OR: [{ phoneNumberId: null }, { phoneNumberId: { isSet: false } }] },
        })
      ),
      safeCountValue("readiness.emailEnabled", () => prisma.communicationSender.count({ where: { channel: "EMAIL", enabled: true } })),
      safeCountValue("readiness.routingRules", () => prisma.senderRoutingRule.count()),
    ]);
  }
  const whatsappStatus = runtimeStatus(runtime.meta);
  const emailStatus = runtimeStatus(runtime.elasticEmail);
  const netgsmStatus = runtimeStatus(runtime.netgsm);
  const brevoSmsStatus = runtimeStatus(runtime.brevoSms);
  const smsStatus: ConnStatus = netgsmStatus === "FAILED" || brevoSmsStatus === "FAILED" ? "FAILED" : netgsmStatus === "READY" || brevoSmsStatus === "READY" ? "READY" : netgsmStatus === "DISABLED" && brevoSmsStatus === "DISABLED" ? "DISABLED" : "NEEDS_SETUP";
  const status: ConnStatus = [whatsappStatus, emailStatus, smsStatus].includes("FAILED") ? "FAILED" : [whatsappStatus, emailStatus, smsStatus].includes("READY") ? "READY" : "NEEDS_SETUP";
  return { status, whatsapp: { status: whatsappStatus, sendersWithNumber, sendersMissingNumber }, email: { status: emailStatus, envConfigured: runtime.elasticEmail.configured && Object.values(runtime.elasticEmail.sources).includes("ENVIRONMENT"), enabledSenders: enabledEmailSenders }, sms: { status: smsStatus }, routingRules, scheduler };
}

export const WHATSAPP_WEBHOOK_PATH = "/api/webhooks/meta/whatsapp";
export type WebhooksReadiness = { status: ConnStatus; webhookPath: string; signatureConfigured: boolean; lastWebhookAt: string | null; scheduler: SchedulerStatus };
export async function getWebhooksReadiness(): Promise<WebhooksReadiness> {
  const [webhook, scheduler, event] = await Promise.all([
    getActiveMetaWebhookConfig(),
    getSchedulerStatus(),
    hasDb() ? prisma.communicationProviderEvent.findFirst({ where: { channel: "WHATSAPP" }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } }).catch(() => null) : null,
  ]);
  return { status: webhook.reason === "INTEGRATION_DECRYPTION_FAILED" ? "FAILED" : webhook.configured ? "READY" : "NEEDS_SETUP", webhookPath: WHATSAPP_WEBHOOK_PATH, signatureConfigured: webhook.configured, lastWebhookAt: event?.receivedAt?.toISOString() ?? null, scheduler };
}

export type OverviewIssue = { title: string; severity: ConnStatus; href: string; action: string };
export async function getOverview() {
  const [tracking, ads, comm, webhooks] = await Promise.all([getTrackingReadiness(), getAdAccountsReadiness(), getCommunicationReadiness(), getWebhooksReadiness()]);
  const issues: OverviewIssue[] = [];
  const base = "/dashboard/platform-connections";
  if (!tracking.rows.find((item) => item.key === "meta_pixel")?.configured) issues.push({ title: "بكسل ميتا غير مُعد", severity: "NEEDS_SETUP", href: `${base}/tracking`, action: "إعداد" });
  if (!tracking.rows.find((item) => item.key === "meta_capi")?.configured) issues.push({ title: "Meta Conversions API غير مُعد", severity: "NEEDS_SETUP", href: `${base}/tracking`, action: "إعداد" });
  // The dedicated الحسابات الإعلانية page was removed, so ad-account issues point at فحص الاتصال.
  for (const account of ads.rows) if (account.status === "FAILED") issues.push({ title: `فشل آخر مزامنة: ${account.label}`, severity: "FAILED", href: `${base}/health`, action: "مراجعة" });
  if (!ads.connectedCount) issues.push({ title: "لا توجد حسابات إعلانية مربوطة", severity: "NEEDS_SETUP", href: `${base}/health`, action: "ربط" });
  if (comm.whatsapp.status !== "READY") issues.push({ title: "إعداد واتساب غير مكتمل", severity: comm.whatsapp.status, href: `${base}/communication`, action: "إعداد" });
  if (comm.whatsapp.sendersMissingNumber > 0) issues.push({ title: "يوجد مُرسِل واتساب بلا رقم مُعرّف", severity: "NEEDS_SETUP", href: `${base}/communication`, action: "مراجعة" });
  if (!webhooks.signatureConfigured) issues.push({ title: "توقيع Webhook غير مفعّل", severity: webhooks.status, href: `${base}/communication`, action: "تأمين" });
  if (comm.sms.status !== "READY") issues.push({ title: "إعداد SMS غير مكتمل", severity: comm.sms.status, href: `${base}/communication`, action: "تفاصيل" });
  return { tracking, ads, comm, webhooks, issues: issues.slice(0, 6) };
}
