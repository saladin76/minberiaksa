import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { CheckCircle2, CircleAlert, XCircle, MinusCircle } from "lucide-react";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { integrationActorFromSession } from "@/lib/integration-settings/http";
import { integrationSettingsService } from "@/lib/integration-settings/prisma-service";
import { withActiveTestState, type SafeIntegrationProviderSnapshotWithTests } from "@/lib/integration-settings/safe-snapshot";
import { getSchedulerStatus } from "@/lib/communication/scheduler-status";
import { getOverview, STATUS_LABEL, type ConnStatus } from "@/lib/platform-connections/readiness";
import { PageHeader, Card, CardHeader } from "../_components/ui";
import { RecheckConnectionsButton } from "./_components/RecheckConnectionsButton";

export const metadata = { title: "فحص الاتصال | ربط المنصات والإرسال" };
export const dynamic = "force-dynamic";
const BASE = "/dashboard/platform-connections";

function activeStatus(snapshot: SafeIntegrationProviderSnapshotWithTests): ConnStatus {
  if (!snapshot.enabled) return "DISABLED";
  if (snapshot.activeTest.lastTestResult === "FAILED") return "FAILED";
  if (snapshot.activeTest.lastTestResult === "SUCCESS") return "READY";
  return snapshot.status === "READY" ? "READY" : "NEEDS_SETUP";
}
function CheckIcon({ status }: { status: ConnStatus }) {
  if (status === "READY") return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (status === "FAILED") return <XCircle className="h-5 w-5 text-rose-600" />;
  if (status === "DISABLED") return <MinusCircle className="h-5 w-5 text-slate-400" />;
  return <CircleAlert className="h-5 w-5 text-amber-500" />;
}
function CheckRow({ label, status, detail, lastTest, href }: { label: string; status: ConnStatus; detail: string; lastTest?: string | null; href: string }) {
  return <div className="flex flex-col gap-3 border-b p-4 last:border-0 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><CheckIcon status={status} /><div><p className="text-sm font-bold text-slate-800">{label}</p><p className="text-xs text-slate-500">{detail}</p>{lastTest ? <p className="mt-1 text-[11px] text-slate-400">آخر فحص: {new Date(lastTest).toLocaleString("ar")}</p> : null}</div></div><div className="flex items-center gap-3"><span className="text-xs font-bold text-slate-500">{STATUS_LABEL[status]}</span><Link href={href} className="text-xs font-bold text-brand">فتح</Link></div></div>;
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
  const cronStatus: ConnStatus = cron.activeTest.lastTestResult === "FAILED" ? "FAILED" : scheduler.configured ? "READY" : "NEEDS_SETUP";
  const checks = [
    { label: "Meta WhatsApp", status: activeStatus(meta), detail: meta.activeTest.lastFailureReasonSafe || "التكوين العامل لحساب Meta ورقم واتساب.", lastTest: meta.activeTest.lastTestAt, href: `${BASE}/communication` },
    { label: "Elastic Email", status: activeStatus(elasticEmail), detail: elasticEmail.activeTest.lastFailureReasonSafe || "التكوين العامل للحساب ونطاق بريد المرسل دون إرسال.", lastTest: elasticEmail.activeTest.lastTestAt, href: `${BASE}/communication` },
    { label: "Brevo SMS", status: activeStatus(brevo), detail: brevo.activeTest.lastFailureReasonSafe || "التكوين العامل لـSMS الدولي دون إرسال.", lastTest: brevo.activeTest.lastTestAt, href: `${BASE}/communication` },
    { label: "Netgsm SMS", status: activeStatus(netgsm), detail: netgsm.activeTest.lastFailureReasonSafe || "التكوين العامل لحساب Netgsm.", lastTest: netgsm.activeTest.lastTestAt, href: `${BASE}/communication` },
    { label: "Cron", status: cronStatus, detail: scheduler.configured ? "حماية Route مضبوطة داخل Vercel." : "CRON_SECRET يحتاج إعدادًا داخل Vercel.", lastTest: cron.activeTest.lastTestAt, href: `${BASE}/communication` },
    { label: "Webhooks", status: webhooks.signatureConfigured ? "READY" as ConnStatus : "NEEDS_SETUP" as ConnStatus, detail: webhooks.signatureConfigured ? "توقيع Webhook مُفعّل." : "توقيع Webhook يحتاج إعدادًا.", lastTest: webhooks.lastWebhookAt, href: `${BASE}/communication` },
  ];
  const readyCount = checks.filter((item) => item.status === "READY").length;
  const canTest = userHasDashboardPermission(session.user, "platformConnectionsTest");

  return <main className="space-y-5 p-4 sm:p-6" dir="rtl"><PageHeader eyebrow="ربط المنصات والإرسال / فحص الاتصال" title="فحص الاتصال" subtitle="يعرض آخر نتائج الفحص الآمنة فقط، دون إرسال رسائل أو تشغيل حملات." actions={canTest ? <RecheckConnectionsButton providers={["META_WHATSAPP", "ELASTIC_EMAIL", "BREVO", "NETGSM", "SYSTEM"]} /> : undefined} /><Card><CardHeader title="نتيجة الفحص" description={`${readyCount} من ${checks.length} جاهز.`} /><div>{checks.map((item) => <CheckRow key={item.label} {...item} />)}</div></Card><p className="text-xs leading-6 text-slate-500">إعادة الفحص إجراء صريح ولا تعتمد تغييرات ولا ترسل رسائل.</p></main>;
}
