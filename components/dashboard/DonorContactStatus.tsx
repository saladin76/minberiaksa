"use client";
import { useEffect, useState } from "react";
import { dt } from "@/lib/dashboard/i18n";

type Status = {
  doNotContact: boolean;
  whatsapp: { hasPhone: boolean; stopped: boolean; at: string | null; undeliverable: number };
  email: { hasEmail: boolean; suppressed: string | null; optedOut: boolean };
};
const EMAIL_REASON: Record<string, string> = { UNSUBSCRIBE: "ألغى الاشتراك", HARD_BOUNCE: "بريد مرتجع (لا يصل)", COMPLAINT: "أبلغ عن رسالة كمزعجة" };

/** What the donor decided, per channel, from the markers the senders enforce (owner, 2026-11-20). */
export default function DonorContactStatus({ userId }: { userId: string }) {
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/users/${userId}/contact-status`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (active && d) setS(d as Status); }).catch(() => undefined);
    return () => { active = false; };
  }, [userId]);
  if (!s) return null;
  const line = (ok: boolean, label: string, text: string) => (
    <div className="flex items-center justify-between gap-2 py-1 text-sm"><span className="text-slate-500">{label}</span><span className={ok ? "text-emerald-700" : "font-semibold text-red-700"}>{ok ? "✓ " : "⛔ "}{text}</span></div>
  );
  const wa = !s.whatsapp.hasPhone ? dt("لا رقم هاتف") : s.whatsapp.stopped ? dt("أوقف الرسائل التسويقية") + (s.whatsapp.at ? ` (${new Date(s.whatsapp.at).toLocaleDateString("ar")})` : "") : s.whatsapp.undeliverable > 0 ? dt("الرقم لا يستقبل واتساب ({0} محاولة فاشلة)", [s.whatsapp.undeliverable]) : dt("يستقبل");
  const em = !s.email.hasEmail ? dt("لا بريد") : s.email.suppressed ? dt(EMAIL_REASON[s.email.suppressed] ?? "موقوف") : dt("يستقبل");
  return (
    <section className="rounded-xl border bg-white p-4">
      <h3 className="mb-1 font-bold">{dt("حالة التواصل")}</h3>
      {s.doNotContact ? <p className="mb-1 rounded bg-red-50 px-2 py-1 text-sm font-semibold text-red-700">⛔ {dt("طلب المتبرع عدم التواصل نهائياً")}</p> : null}
      {line(s.whatsapp.hasPhone && !s.whatsapp.stopped && s.whatsapp.undeliverable === 0, dt("واتساب"), wa)}
      {line(s.email.hasEmail && !s.email.suppressed, dt("البريد"), em)}
      <p className="mt-1 text-xs text-slate-500">{dt("الرسائل الخدمية (الإيصالات والشهادات) تصل رغم إيقاف التسويق، إلا عند طلب عدم التواصل.")}</p>
    </section>
  );
}
