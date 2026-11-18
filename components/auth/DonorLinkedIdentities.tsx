"use client";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import DonorCodeLogin from "./DonorCodeLogin";

type Identity = { id: string; channel: string; contact: string };
export default function DonorLinkedIdentities() {
  const locale = useLocale(), ar = locale === "ar", tr = locale === "tr";
  const [data, setData] = useState<{ identities: Identity[]; primaryEmail: string | null }>({ identities: [], primaryEmail: null });
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/users/me/login-identities", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setData(await response.json()); setError("");
    } catch { setError(ar ? "تعذر تحميل وسائل الدخول." : tr ? "Giriş yöntemleri yüklenemedi." : "Could not load sign-in methods."); }
  }, [ar]);
  useEffect(() => { void load(); }, [load]);
  async function primary(identityId: string) {
    try {
      const response = await fetch("/api/users/me/login-identities", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identityId }) });
      if (!response.ok) throw new Error();
      await load();
      window.location.reload();
    } catch { setError(ar ? "تعذر تغيير البريد الأساسي." : tr ? "Birincil e-posta değiştirilemedi." : "Could not change primary email."); }
  }
  return <section id="linked-login-identities" className="mx-auto my-6 w-full max-w-5xl rounded-2xl border bg-white p-5" dir={ar ? "rtl" : "ltr"}>
    <h2 className="mb-3 text-lg font-bold">{ar ? "طرق الدخول والحسابات المرتبطة" : tr ? "Giriş Yöntemleri ve Bağlı Hesaplar" : "Sign-in methods and linked accounts"}</h2>
    {data.identities.map(item => <div key={item.id} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 p-3">
      <span dir="ltr">{item.channel === "WHATSAPP" ? "WhatsApp: " : ""}{item.contact}</span>
      {item.channel === "EMAIL" && (item.contact === data.primaryEmail ? <span>{ar ? "البريد الأساسي" : tr ? "Birincil e-posta" : "Primary email"}</span> : <button type="button" onClick={() => void primary(item.id)} className="text-sm underline">{ar ? "تعيين كأساسي" : tr ? "Birincil Olarak Ayarla" : "Set as primary"}</button>)}
    </div>)}
    <p role="status">{error}</p>
    <DonorCodeLogin link onDone={() => window.location.reload()} />
  </section>;
}
