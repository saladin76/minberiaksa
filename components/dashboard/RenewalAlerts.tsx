"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { dt } from "@/lib/dashboard/i18n";
import type { RenewalLevel, ServiceRenewal } from "@/lib/service-renewals/shared";

type Alert = ServiceRenewal & { level: RenewalLevel; days: number | null };
const TONE: Record<string, string> = { OVERDUE: "border-red-300 bg-red-50 text-red-800", URGENT: "border-red-300 bg-red-50 text-red-800", NEAR: "border-orange-300 bg-orange-50 text-orange-800", SOON: "border-amber-200 bg-amber-50 text-amber-800" };

/** Top-of-dashboard reminders for services about to renew. Admins only (others get nothing back); hidden when all is well. */
export default function RenewalAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  useEffect(() => {
    fetch("/api/admin/service-renewals?alerts=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { alerts: [] }))
      .then((d: { alerts?: Alert[] }) => setAlerts(Array.isArray(d.alerts) ? d.alerts : []))
      .catch(() => undefined);
  }, []);
  if (!alerts.length) return null;
  return (
    <div className="mb-4 space-y-2" role="region" aria-label={dt("تنبيهات تجديد الخدمات")}>
      {alerts.map((a) => (
        <Link key={a.id} href="/dashboard/renewals" className={`block rounded-lg border px-4 py-2 text-sm ${TONE[a.level] ?? ""}`}>
          <b>{a.name}</b>{a.provider ? ` (${a.provider})` : ""} · {a.level === "OVERDUE"
            ? (a.auto ? dt("شهادة الأمان منتهية، يجب تجديدها فوراً") : dt("مرّ موعد التجديد منذ {0} يوم: تأكد أن التجديد تم", [Math.abs(a.days ?? 0)]))
            : a.days === 0 ? dt("يتجدد اليوم") : dt("يتجدد خلال {0} يوم", [a.days ?? 0])}
          {a.amount != null ? ` · ${a.amount} ${a.currency ?? ""}` : ""}
          {a.cardLast4 ? ` · ${dt("تأكد من رصيد البطاقة …{0}", [a.cardLast4])}` : !a.auto ? ` · ${dt("تأكد من طريقة الدفع")}` : ""}
        </Link>
      ))}
    </div>
  );
}
