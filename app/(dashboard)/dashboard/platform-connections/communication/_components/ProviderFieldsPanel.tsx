"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, RefreshCw, RotateCcw, Save, ShieldCheck, TestTube2, Trash2 } from "lucide-react";
import type { SafeProviderConnectionTestResponse } from "@/lib/integration-settings/types";
import { fieldHelp, PROVIDER_UI_LABEL, safeErrorMessage, uiStatus } from "@/lib/integration-settings/ui";
import { ActionButton, Banner, CopyableCode, InfoPanel, Stat, StatusChip } from "./panel-ui";
import { ADVANCED_LINKS, WEBHOOKS, ROTATABLE_WEBHOOK_PROVIDERS, sourceLabel, type IntegrationUiPermissions, type IntegrationUiSnapshot, type SchedulerUiStatus } from "./model";

type Notice = { kind: "success" | "error"; text: string } | null;
type WebhookReveal = { url: string; candidateVersion: string | null } | null;

export function ProviderFieldsPanel({
  snapshot, permissions, scheduler, drafts, dirty, busy, notice, lastCandidateTest, lastActiveTest,
  webhookReveal, onDraft, onSave, onTestCandidate, onTestActive, onActivate, onDiscard,
  onRotateWebhook, onDelete, onToggle, onNotice,
}: {
  snapshot: IntegrationUiSnapshot;
  permissions: IntegrationUiPermissions;
  scheduler: SchedulerUiStatus;
  drafts: Record<string, string>;
  dirty: Set<string>;
  busy: string | null;
  notice: Notice;
  lastCandidateTest: SafeProviderConnectionTestResponse | null;
  lastActiveTest: SafeProviderConnectionTestResponse | null;
  webhookReveal: WebhookReveal;
  onDraft: (key: string, value: string) => void;
  onSave: () => void;
  onTestCandidate: () => void;
  onTestActive: () => void;
  onActivate: () => void;
  onDiscard: () => void;
  onRotateWebhook: () => void;
  onDelete: (key: string, label: string) => void;
  onToggle: () => void;
  onNotice: (value: Notice) => void;
}) {
  const provider = snapshot.provider;
  const isCron = provider === "SYSTEM";
  const completed = snapshot.fields.filter((field) => field.configured).length;
  const encryptionBlocked = !snapshot.encryptionKeyConfigured;
  const activeComplete = isCron ? scheduler.configured : snapshot.missingRequiredFields.length === 0;
  // Providers whose webhook secret is minted server-side: the field is read-only in the form and
  // rotated through a dedicated one-time-reveal action instead.
  const rotatableWebhook = ROTATABLE_WEBHOOK_PROVIDERS[provider];
  const isManagedWebhookField = (key: string) => !!rotatableWebhook && key === "WEBHOOK_SECRET";

  async function copyAbsolutePath(path: string) {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    onNotice({ kind: "success", text: "تم نسخ الرابط." });
  }

  async function copyOneTimeUrl(url: string) {
    await navigator.clipboard.writeText(url);
    onNotice({ kind: "success", text: "تم نسخ الرابط. احتفظ به الآن لأنه لن يظهر كاملًا مرة أخرى." });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500">{PROVIDER_UI_LABEL[provider]}</p>
          <h2 className="mt-0.5 text-base font-semibold text-slate-900">
            {isCron ? "بنية الجدولة التحتية" : "إعدادات المزود"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {isCron ? "يُدار CRON_SECRET داخل Vercel فقط." : `${completed}/${snapshot.fields.length} حقل مكتمل`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isCron && <StatusChip status={uiStatus(snapshot)} />}
          {!isCron && permissions.canAdmin && (
            <button
              type="button"
              disabled={!!busy}
              onClick={onToggle}
              className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {snapshot.enabled ? "تعطيل المزود" : "تفعيل المزود"}
            </button>
          )}
        </div>
      </header>

      <div className="space-y-5 p-4 sm:p-5">
        {notice && (
          <Banner tone={notice.kind === "success" ? "success" : "danger"} title={notice.text} />
        )}

        {isCron ? (
          <CronInfrastructure scheduler={scheduler} busy={busy} canTest={permissions.canTest} onTest={onTestActive} />
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              {snapshot.fields.map((field) => (
                <div key={field.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <label htmlFor={`${provider}-${field.key}`} className="text-sm font-semibold text-slate-900">
                        {field.labelAr}
                        {field.required ? <span className="text-rose-500"> *</span> : null}
                      </label>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{fieldHelp(provider, field.key)}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      {sourceLabel(field.source)}
                    </span>
                  </div>

                  {permissions.canManage ? (
                    <div className="mt-3">
                      <input
                        id={`${provider}-${field.key}`}
                        type={field.isSecret ? "password" : "text"}
                        value={drafts[field.key] ?? ""}
                        onChange={(event) => onDraft(field.key, event.target.value)}
                        placeholder={field.isSecret ? (field.configured ? "اتركه فارغًا للاحتفاظ بالقيمة المحفوظة" : "أدخل القيمة السرية") : "أدخل القيمة"}
                        autoComplete={field.isSecret ? "new-password" : "off"}
                        disabled={!!busy || (field.isSecret && encryptionBlocked) || isManagedWebhookField(field.key)}
                        aria-describedby={`${provider}-${field.key}-help`}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      />
                      <p id={`${provider}-${field.key}-help`} className="mt-1.5 text-[11px] text-slate-500">
                        {isManagedWebhookField(field.key)
                          ? "يتم إنشاؤه وتدويره آليًا من السيرفر."
                          : field.isSecret ? field.configured ? `محفوظ: ${field.maskedValue ?? "قيمة آمنة"}` : "غير محفوظ"
                          : field.hasPendingValue ? "توجد قيمة جديدة بانتظار الاختبار أو الاعتماد."
                          : dirty.has(field.key) ? "تم تعديل القيمة ولم تحفظ بعد." : "القيمة قابلة للعرض والتعديل."}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      {field.isSecret ? field.configured ? `محفوظ: ${field.maskedValue}` : "غير محفوظ" : field.displayValue || "غير مضبوط"}
                    </div>
                  )}

                  {permissions.canAdmin && field.configured && !isManagedWebhookField(field.key) && (
                    <div className="mt-3 border-t border-slate-200 pt-2.5 text-end">
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => onDelete(field.key, field.labelAr)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 transition-colors hover:text-rose-700 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> حذف الإعداد
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {rotatableWebhook && (
              <InfoPanel
                title={rotatableWebhook.title}
                description="لا يُعرض رابط ناقص. أنشئ رابطًا محميًا من السيرفر ثم اختبر التغييرات واعتمدها ليصبح الرابط صالحًا."
              >
                {webhookReveal ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-900">{rotatableWebhook.revealHint}</p>
                    <CopyableCode className="mt-2" value={webhookReveal.url} onCopy={() => copyOneTimeUrl(webhookReveal.url)} />
                  </div>
                ) : (
                  <p className="text-xs text-brand-800/80">
                    {snapshot.fields.find((field) => field.key === "WEBHOOK_SECRET")?.hasPendingValue
                      ? "رابط جديد بانتظار اعتماد الإعدادات."
                      : snapshot.fields.find((field) => field.key === "WEBHOOK_SECRET")?.configured
                        ? "Webhook محمي ومُعد. يمكن تدوير الرابط عند الحاجة."
                        : "Webhook غير مُعد."}
                  </p>
                )}
                {permissions.canManage && (
                  <div className="mt-3">
                    <ActionButton
                      disabled={!!busy || encryptionBlocked}
                      loading={busy === "rotate-webhook"}
                      onClick={onRotateWebhook}
                      icon={<RefreshCw className="h-4 w-4" />}
                      label={rotatableWebhook.actionLabel}
                    />
                  </div>
                )}
              </InfoPanel>
            )}

            {WEBHOOKS[provider] && (
              <InfoPanel
                title={WEBHOOKS[provider]!.label}
                description={provider === "META_WHATSAPP" ? "استخدم Webhook Verify Token نفسه داخل Meta. التحقق منه محلي ولا يعني أن Meta اختبرته خارجيًا." : undefined}
              >
                <CopyableCode value={WEBHOOKS[provider]!.path} onCopy={() => copyAbsolutePath(WEBHOOKS[provider]!.path)} />
              </InfoPanel>
            )}

            <div className="grid gap-3 lg:grid-cols-2">
              <TestResult title="فحص التكوين العامل" result={lastActiveTest} fallbackAt={snapshot.activeTest.lastTestAt} fallbackResult={snapshot.activeTest.lastTestResult} failure={snapshot.activeTest.lastFailureReasonSafe} />
              <TestResult title="اختبار التغييرات" result={lastCandidateTest} fallbackAt={snapshot.candidate.lastTestAt} fallbackResult={snapshot.candidate.lastTestResult} failure={snapshot.candidate.lastFailureReasonSafe} />
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              {permissions.canManage && <ActionButton disabled={!!busy || dirty.size === 0} loading={busy === "save"} onClick={onSave} icon={<Save className="h-4 w-4" />} label="حفظ التغييرات" variant="primary" />}
              {permissions.canTest && activeComplete && <ActionButton disabled={!!busy} loading={busy === "test-active"} onClick={onTestActive} icon={<ShieldCheck className="h-4 w-4" />} label="فحص الإعدادات الحالية" />}
              {permissions.canTest && snapshot.candidate.hasChanges && <ActionButton disabled={!!busy} loading={busy === "test-candidate"} onClick={onTestCandidate} icon={<TestTube2 className="h-4 w-4" />} label="اختبار التغييرات" />}
              {permissions.canManage && snapshot.candidate.lastTestResult === "SUCCESS" && snapshot.candidate.version && <ActionButton disabled={!!busy} loading={busy === "activate"} onClick={onActivate} icon={<CheckCircle2 className="h-4 w-4" />} label="اعتماد الإعدادات" variant="success" />}
              {permissions.canManage && snapshot.candidate.hasChanges && <ActionButton disabled={!!busy} loading={busy === "discard"} onClick={onDiscard} icon={<RotateCcw className="h-4 w-4" />} label="إلغاء التغييرات" variant="danger" />}
            </div>
          </>
        )}

        {ADVANCED_LINKS[provider]?.length ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 pt-4">
            {ADVANCED_LINKS[provider]!.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand transition-colors hover:text-brand-700"
              >
                {item.label}
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CronInfrastructure({ scheduler, busy, canTest, onTest }: { scheduler: SchedulerUiStatus; busy: string | null; canTest: boolean; onTest: () => void }) {
  return (
    <div className="space-y-4">
      <Banner tone="pending" title="مفتاح Cron من إعدادات البنية التحتية ويُضبط مرة واحدة داخل Vercel لأن Vercel يرسله تلقائيًا مع طلبات الجدولة.">
        <code className="inline-block rounded-md border border-amber-200 bg-white px-2 py-1 text-xs" dir="ltr">CRON_SECRET</code>
      </Banner>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="CRON_SECRET في السيرفر" value={scheduler.configured ? "موجود" : "غير مضبوط"} />
        <Stat label="حماية Route" value={scheduler.configured ? "Authorization Bearer" : "غير جاهزة"} />
        <Stat label="آخر تشغيل" value={formatDate(scheduler.lastRunAt)} />
        <Stat label="آخر تشغيل ناجح" value={formatDate(scheduler.lastSuccessfulRunAt)} />
        <Stat label="حملات مجدولة" value={String(scheduler.scheduledCount)} />
        <Stat label="مستحقة الآن" value={String(scheduler.dueCount)} />
      </div>

      <InfoPanel title="Route الجدولة الرسمي" description="فحص الحماية لا ينفذ الحملات المستحقة.">
        <code className="block overflow-x-auto rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700" dir="ltr">
          /api/cron/communication-run-due
        </code>
      </InfoPanel>

      {canTest && (
        <ActionButton disabled={!!busy} loading={busy === "test-active"} onClick={onTest} icon={<ShieldCheck className="h-4 w-4" />} label="فحص حماية Route" />
      )}
    </div>
  );
}

function TestResult({ title, result, fallbackAt, fallbackResult, failure }: { title: string; result: SafeProviderConnectionTestResponse | null; fallbackAt: string | null; fallbackResult: "SUCCESS" | "FAILED" | null; failure: string | null }) {
  const success = result ? result.success : fallbackResult === "SUCCESS";
  const failed = result ? !result.success : fallbackResult === "FAILED";
  const at = result?.testedAt ?? fallbackAt;
  if (!at && !result) return null;
  const message = (result?.messageAr || failure)
    ? safeErrorMessage(result?.failureCode ?? failure, result?.messageAr ?? failure ?? "")
    : null;
  return (
    <Banner
      tone={success ? "success" : failed ? "danger" : "neutral"}
      title={`${title}: ${success ? "ناجح" : failed ? "فشل" : "لم يتم"}`}
      meta={at ? `وقت الفحص: ${formatDate(at)}` : undefined}
    >
      {message}
    </Banner>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("ar") : "لم يتم";
}
