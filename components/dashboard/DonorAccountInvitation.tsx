"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { dt } from "@/lib/dashboard/i18n";

export default function DonorAccountInvitation({ userId }: { userId: string }) {
  const { data: session } = useSession();
  const [channel, setChannel] = useState("EMAIL"), [status, setStatus] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (session?.user?.role !== "ADMIN") return;
    let active = true;
    const read = async () => {
      try {
        const response = await fetch(`/api/users/${userId}/account-invitation`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        const state = data.invitation?.status;
        if (active) setStatus(state === "ACTIVATED" ? dt("تم التفعيل") : state === "EXPIRED" ? dt("انتهت صلاحية الدعوة؛ يمكن إعادة الإرسال") : data.delivery?.status === "FAILED" || state === "FAILED" ? dt("تعذّر الإرسال") : ["DELIVERED", "READ"].includes(data.delivery?.status) ? dt("تم تسليم الدعوة") : state === "SENT" ? dt("أُرسلت الدعوة؛ لم يُؤكد التسليم بعد") : dt("لم يُدعَ"));
      } catch { if (active) setStatus(dt("تعذر تحديث حالة الدعوة")); }
    };
    void read();
    const timer = setInterval(() => void read(), 15_000);
    return () => { active = false; clearInterval(timer); };
  }, [userId, session?.user?.role]);
  if (session?.user?.role !== "ADMIN") return null;
  async function send() {
    setBusy(true);
    try {
      const response = await fetch(`/api/users/${userId}/account-invitation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel }) });
      const result = await response.json();
      if (!response.ok) { setStatus(result.error === "RATE_LIMITED" ? dt("انتظر دقيقة قبل إعادة الإرسال") : dt("تعذّر إرسال الدعوة. راجع إعدادات الإرسال وبيانات المتبرع.")); return; }
      setStatus(dt("أُرسلت الدعوة؛ لم يُؤكد التسليم بعد"));
    } catch { setStatus(dt("تعذّر الإرسال")); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border bg-white p-4">
    <h3 className="font-bold">{dt("إنشاء حساب وإرسال دعوة الدخول")}</h3>
    <p className="my-2 text-sm">{dt("يتفعل الحساب بعد تحقق المتبرع من الكود. إذا كان لديه حساب، تصله دعوة للدخول إلى الحساب نفسه.")}</p>
    <div className="flex flex-wrap gap-2"><select aria-label={dt("قناة الدعوة")} disabled={busy} value={channel} onChange={e => setChannel(e.target.value)} className="rounded border p-2"><option value="EMAIL">{dt("البريد الإلكتروني")}</option><option value="WHATSAPP">WhatsApp</option></select>
      <button type="button" disabled={busy} onClick={() => void send()} className="rounded bg-brand px-4 py-2 text-white disabled:opacity-50">{busy ? dt("جارٍ الإرسال") : dt("إرسال / إعادة إرسال دعوة الدخول")}</button></div>
    <p role="status" className="mt-2 text-sm">{status}</p>
  </section>;
}
