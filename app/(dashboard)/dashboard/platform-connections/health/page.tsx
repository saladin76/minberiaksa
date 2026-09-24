import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { CheckCircle2, CircleAlert, XCircle, MinusCircle, CircleDashed } from "lucide-react";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { integrationActorFromSession } from "@/lib/integration-settings/http";
import { integrationSettingsService } from "@/lib/integration-settings/prisma-service";
import { withActiveTestState, type SafeIntegrationProviderSnapshotWithTests } from "@/lib/integration-settings/safe-snapshot";
import { getSchedulerStatus } from "@/lib/communication/scheduler-status";
import { getOverview } from "@/lib/platform-connections/readiness";
import { PageHeader, Card, CardHeader } from "../_components/ui";
import { RecheckConnectionsButton } from "./_components/RecheckConnectionsButton";

export const metadata = { title: "فحص الاتصال | ربط المنصات والإرسال" };
export const dynamic = "force-dynamic";
const BASE = "/dashboard/platform-connections";

/**
 * What this page can honestly claim about each connection. "Configured" (keys or
 * settings exist) is not "verified" (a real test call to the provider passed),
 * and neither proves messages are delivered. The page used to show both as
 * «جاهز»; now only a passing live test earns the green tick.
 */
type HealthState = "VERIFIED" | "CONFIGURED" | "NEEDS_SETUP" | "FAILED" | "DISABLED";
const HEALTH_LABEL: Record<HealthState, string> = {
  VERIFIED: "تم التحقق باختبار اتصال",
  CONFIGURED: "مُعدّ — لم يُختبر",
  NEEDS_SETUP: "يحتاج إعداد",
  FAILED: "فشل آخر اختبار",
  DISABLED: "غير مفعّل",
};

function providerState(snapshot: SafeIntegrationProviderSnapshotWithTests): HealthState {
  if (!snapshot.enabled) return "DISABLED";
  if (snapshot.activeTest.lastTestResult === "FAILED") return "FAILED";
  if (snapshot.activeTest.lastTestResult === "SUCCESS") return "VERIFIED";
  return snapshot.status === "READY" ? "CONFIGURED" : "NEEDS_SETUP";
}

function providerEvidence(state: HealthState): string {
  if (state === "VERIFIED") return "آخر اختبار اتصال بالمزوّد نجح. هذا لا يثبت وصول الرسائل — راجع سجل الإرسال.";
  if (state === "CONFIGURED") return "الإعدادات موجودة فقط؛ لم يُجرَ اختبار اتصال بعد. استخدم «إعادة الفحص».";
  if (state === "FAILED") return "آخر اختبار اتصال فشل.";
  if (state === "DISABLED") return "المزوّد غير مفعّل.";
  return "الإعدادات ناقصة.";
}

function CheckIcon({ state }: { state: HealthState }) {
  if (state === "VERIFIED") return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (state === "CONFIGURED") return <CircleDashed className="h-5 w-5 text-sky-600" />;
  if (state === "FAILED") return <XCircle className="h-5 w-5 text-rose-600" />;
  if (state === "DISABLED") return <MinusCircle className="h-5 w-5 text-slate-400" />;
  return <CircleAlert className="h-5 w-5 text-amber-500" />;
}

type Check = {
  label: string;
  state: HealthState;
  detail: string;
  evidence: string;
  lastTest?: string | null;
  lastTestLabel?: string;
  href: string;
};

function CheckRow({ label, state, detail, evidence, lastTest, lastTestLabel = "آخر فحص", href }: Check) {
  return (
    <div className="flex flex-col gap-3 border-b p-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <CheckIcon state={state} />
        <div>
          <p className="text-sm font-bold text-slate-800">{label}</p>
          <p className="text-xs text-slate-500">{detail}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-600">{evidence}</p>
          {lastTest ? (
            <p className="mt-1 text-[11px] text-slate-400">
              {lastTestLabel}: {new Date(lastTest).toLocaleString("ar")}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-slate-500">{HEALTH_LABEL[state]}</span>
        <Link href={href} className="text-xs font-bold text-brand">فتح</Link>
      </div>
    </div>
  );
}

export default async function HealthPage() {
  const access = resolveDashboardPageAccess(await getServerSession(authOptions), "platformConnections");
  if (!access.allowed) redirect(access.redirectTo);
  const session = access.session;
  const actor = integrationActorFromSession(session);
  const [{ webhooks }, scheduler, meta, elasticEmail, brevo, netgsm, cron] = await Promise.all([
    getOverview(),
    getSchedulerStatus(),
    integrationSettingsService.getProviderSnapshot("META_WHATSAPP", actor).then(withActiveTestState),
    integrationSettingsService.getProviderSnapshot("ELASTIC_EMAIL", actor).then(withActiveTestState),
    integrationSettingsService.getProviderSnapshot("BREVO", actor).then(withActiveTestState),
    integrationSettingsService.getProviderSnapshot("NETGSM", actor).then(withActiveTestState),
    integrationSettingsService.getProviderSnapshot("SYSTEM", actor).then(withActiveTestState),
  ]);

  const providerRow = (label: string, snapshot: SafeIntegrationProviderSnapshotWithTests, detail: string): Check => {
    const state = providerState(snapshot);
    return {
      label,
      state,
      detail: snapshot.activeTest.lastFailureReasonSafe || detail,
      evidence: providerEvidence(state),
      lastTest: snapshot.activeTest.lastTestAt,
      href: `${BASE}/communication`,
    };
  };

  const cronState: HealthState =
    cron.activeTest.lastTestResult === "FAILED" ? "FAILED"
    : cron.activeTest.lastTestResult === "SUCCESS" ? "VERIFIED"
    : scheduler.configured ? "CONFIGURED"
    : "NEEDS_SETUP";
  // A signature secret is configuration; a webhook actually received is evidence.
  const webhookState: HealthState =
    !webhooks.signatureConfigured ? "NEEDS_SETUP" : webhooks.lastWebhookAt ? "VERIFIED" : "CONFIGURED";

  const checks: Check[] = [
    providerRow("Meta WhatsApp", meta, "التكوين العامل لحساب Meta ورقم واتساب."),
    providerRow("Elastic Email", elasticEmail, "التكوين العامل للحساب ونطاق بريد المرسل دون إرسال."),
    providerRow("Brevo SMS", brevo, "التكوين العامل لـSMS الدولي دون إرسال."),
    providerRow("Netgsm SMS", netgsm, "التكوين العامل لحساب Netgsm."),
    {
      label: "Cron",
      state: cronState,
      detail: scheduler.configured ? "حماية Route مضبوطة داخل Vercel." : "CRON_SECRET يحتاج إعدادًا داخل Vercel.",
      evidence:
        cronState === "VERIFIED" ? "آخر اختبار للجدولة نجح."
        : cronState === "CONFIGURED" ? "السر مضبوط؛ لم يُختبر تشغيل الجدولة."
        : providerEvidence(cronState),
      lastTest: cron.activeTest.lastTestAt,
      href: `${BASE}/communication`,
    },
    {
      label: "Webhooks",
      state: webhookState,
      detail: webhooks.signatureConfigured ? "توقيع Webhook مُفعّل." : "توقيع Webhook يحتاج إعدادًا.",
      evidence:
        webhookState === "VERIFIED" ? "استُلم Webhook فعلي من المزوّد."
        : webhookState === "CONFIGURED" ? "التوقيع مضبوط، لكن لم يُستلم أي Webhook بعد."
        : "الإعداد ناقص.",
      lastTest: webhooks.lastWebhookAt,
      lastTestLabel: "آخر Webhook مستلم",
      href: `${BASE}/communication`,
    },
  ];
  const verifiedCount = checks.filter((item) => item.state === "VERIFIED").length;
  const configuredCount = checks.filter((item) => item.state === "CONFIGURED").length;
  const canTest = userHasDashboardPermission(session.user, "platformConnectionsTest");

  return (
    <main className="space-y-5 p-4 sm:p-6" dir="rtl">
      <PageHeader
        eyebrow="ربط المنصات والإرسال / فحص الاتصال"
        title="فحص الاتصال"
        subtitle="يعرض آخر نتائج الفحص الآمنة فقط، دون إرسال رسائل أو تشغيل حملات."
        actions={canTest ? <RecheckConnectionsButton providers={["META_WHATSAPP", "ELASTIC_EMAIL", "BREVO", "NETGSM", "SYSTEM"]} /> : undefined}
      />
      <Card>
        <CardHeader
          title="نتيجة الفحص"
          description={`${verifiedCount} من ${checks.length} تم التحقق منها باختبار، و${configuredCount} مُعدّة دون اختبار.`}
        />
        <div>{checks.map((item) => <CheckRow key={item.label} {...item} />)}</div>
      </Card>
      <p className="text-xs leading-6 text-slate-500">
        «مُعدّ» يعني أن الإعدادات موجودة فقط. «تم التحقق» يعني أن اختبار اتصال حقيقيًا بالمزوّد نجح، ولا يثبت وصول
        الرسائل للمستلمين. إعادة الفحص إجراء صريح ولا تعتمد تغييرات ولا ترسل رسائل.
      </p>
    </main>
  );
}
