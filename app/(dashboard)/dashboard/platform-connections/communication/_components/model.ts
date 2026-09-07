import type { IntegrationProvider } from "@/lib/integration-settings/catalog";
import type { SafeIntegrationProviderSnapshotWithTests } from "@/lib/integration-settings/safe-snapshot";

export type IntegrationUiSnapshot = SafeIntegrationProviderSnapshotWithTests;
export const PROVIDER_ORDER: IntegrationProvider[] = ["META_WHATSAPP", "ELASTIC_EMAIL", "BREVO", "NETGSM", "SYSTEM"];

export const WEBHOOKS: Partial<Record<IntegrationProvider, { label: string; path: string }>> = {
  META_WHATSAPP: { label: "رابط Meta Webhook", path: "/api/webhooks/meta/whatsapp" },
  ELASTIC_EMAIL: { label: "رابط أحداث Elastic Email", path: "/api/webhooks/elastic-email" },
  BREVO: { label: "رابط أحداث Brevo SMS", path: "/api/webhooks/brevo/transactional" },
  SYSTEM: { label: "رابط Cron", path: "/api/cron/communication-run-due" },
};

/**
 * Providers whose webhook secret is minted server-side and revealed exactly once. The panel makes
 * the WEBHOOK_SECRET field read-only for these and offers a rotate action instead.
 */
export const ROTATABLE_WEBHOOK_PROVIDERS: Partial<Record<IntegrationProvider, { title: string; actionLabel: string; revealHint: string }>> = {
  ELASTIC_EMAIL: {
    title: "Elastic Email Webhook",
    actionLabel: "إنشاء أو تدوير رابط Elastic Email Webhook",
    revealHint: "انسخ الرابط الآن وأضفه داخل Elastic Email ضمن Settings → Notifications. لن يظهر رمز الحماية كاملًا مرة أخرى.",
  },
  BREVO: {
    title: "Brevo Webhook",
    actionLabel: "إنشاء أو تدوير رابط Brevo Webhook",
    revealHint: "انسخ الرابط الآن وأضفه داخل Brevo. لن يظهر رمز الحماية كاملًا مرة أخرى.",
  },
};

/**
 * Every entry here used to point into /dashboard/operations, which was removed with التشغيل.
 * The sender-management and scheduling-detail pages have no successor, so those providers now
 * carry no advanced link — the map is Partial precisely so a provider can have none, and an
 * absent link is better than one that 404s. The flat message log at /dashboard/messages has since
 * been removed too; Netgsm's send history lives on the per-channel SMS page.
 */
export const ADVANCED_LINKS: Partial<Record<IntegrationProvider, { href: string; label: string }[]>> = {
  NETGSM: [{ href: "/dashboard/communication/sms", label: "فتح سجل الرسائل النصية" }],
};

export type IntegrationUiPermissions = {
  canView: boolean;
  canTest: boolean;
  canManage: boolean;
  canAdmin: boolean;
};

export type SchedulerUiStatus = {
  configured: boolean;
  scheduledCount: number;
  dueCount: number;
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
};

export function sourceLabel(source: string): string {
  return source === "DATABASE" ? "محفوظ داخل النظام" : source === "ENVIRONMENT" ? "مستخدم من إعدادات السيرفر" : "غير مضبوط";
}
