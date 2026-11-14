"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useLocale } from "next-intl";

export default function DonorCodeLogin({ link = false, onDone, callbackUrl }: { link?: boolean; onDone?: () => void; callbackUrl?: string }) {
  const locale = useLocale(), ar = locale === "ar", tr = locale === "tr";
  const [channel, setChannel] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<{ challengeId: string; ticket: string } | null>(null);
  const [invitation, setInvitation] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [retryAt, setRetryAt] = useState(0), [now, setNow] = useState(0);
  useEffect(() => {
    if (link) return;
    const params = new URLSearchParams(window.location.search);
    const challengeId = params.get("challenge"), ticket = params.get("ticket");
    if (challengeId && ticket && /^[a-f0-9]{64}$/.test(challengeId) && /^[a-f0-9]{64}$/.test(ticket)) {
      setChallenge({ challengeId, ticket });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [link]);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => { const current = Date.now(); setNow(current); if (current >= retryAt) clearInterval(timer); }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const errorText = (error: string) => error === "RATE_LIMITED"
    ? ar ? "انتظر دقيقة قبل طلب كود جديد." : tr ? "Yeni kod istemeden önce lütfen bekleyin." : "Please wait before requesting another code."
    : error === "ACCOUNT_CONFLICT" ? ar ? "تعذر ربط الحسابين تلقائيًا. تواصل مع الدعم." : tr ? "Hesaplar otomatik olarak bağlanamadı. Destek ekibiyle iletişime geçin." : "These accounts could not be linked automatically. Contact support."
    : error === "DELIVERY_UNAVAILABLE" || error === "UNAVAILABLE" ? ar ? "تعذر إرسال الكود حاليًا. جرّب البريد أو Google." : tr ? "Kod şu anda gönderilemiyor. E-posta veya Google ile deneyin." : "Code delivery is unavailable. Try email or Google."
    : ar ? "تحقق من البيانات والكود وصلاحيته، ثم أعد المحاولة." : tr ? "Bilgilerinizi ve kodun geçerliliğini kontrol edip tekrar deneyin." : "Check your details and code, then try again.";
  async function requestCode() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/donor-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, contact, locale, link }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setChallenge(data); setInvitation(false); setCode("");
      setNow(Date.now()); setRetryAt(Date.now() + 60_000);
      setMessage(ar ? "أُرسل الكود، وصلاحيته 10 دقائق." : tr ? "Kod gönderildi. Geçerlilik süresi 10 dakikadır." : "Code sent. It expires in 10 minutes.");
    } catch (error) { setMessage(errorText(error instanceof Error ? error.message : "UNAVAILABLE")); }
    finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true); setMessage("");
    try {
      if (link) {
        const response = await fetch("/api/auth/donor-code", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...challenge, code }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setChallenge(null); setContact(""); setCode(""); setMessage(ar ? "تم الربط بنجاح." : tr ? "Hesap başarıyla bağlandı." : "Linked successfully."); onDone?.();
      } else {
        const result = await signIn("donor-code", { ...challenge, code, contact, channel, invitation: String(invitation), redirect: false });
        if (!result?.ok || result.error) throw new Error(result?.error || "INVALID_CODE");
        if (onDone) onDone();
        else window.location.assign(callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : `/${locale}/account`);
      }
    } catch (error) { setMessage(errorText(error instanceof Error ? error.message : "INVALID_CODE")); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4" dir={ar ? "rtl" : "ltr"} aria-label={ar ? "الدخول بكود" : tr ? "Kod ile Giriş" : "Sign in with a code"}>
    <p className="font-semibold">{link ? ar ? "إضافة وسيلة دخول" : tr ? "Giriş Yöntemi Ekle" : "Add a sign-in method" : ar ? "الدخول بالبريد أو واتساب" : tr ? "E-posta veya WhatsApp ile Giriş Yap" : "Sign in with email or WhatsApp"}</p>
    {!challenge && <>
      <label className="block text-sm">{ar ? "طريقة استلام الكود" : tr ? "Kodu Nasıl Almak İstersiniz?" : "Receive your code by"}
        <select disabled={busy} value={channel} onChange={e => { setChannel(e.target.value as typeof channel); setCode(""); setMessage(""); }} className="mt-1 w-full rounded-lg border p-2">
          <option value="EMAIL">{ar ? "البريد الإلكتروني" : tr ? "E-posta" : "Email"}</option><option value="WHATSAPP">WhatsApp</option>
        </select>
      </label>
      <label className="block text-sm">{channel === "EMAIL" ? ar ? "البريد الإلكتروني" : tr ? "E-posta adresi" : "Email address" : ar ? "رقم واتساب مع رمز الدولة" : tr ? "Ülke koduyla WhatsApp numarası" : "WhatsApp number with country code"}
        <input disabled={busy} type={channel === "EMAIL" ? "email" : "tel"} autoComplete={channel === "EMAIL" ? "email" : "tel"} maxLength={254} value={contact} onChange={e => setContact(e.target.value)} dir="ltr" className="mt-1 w-full rounded-lg border p-2" placeholder={channel === "EMAIL" ? "name@example.com" : "+905xxxxxxxxx"} />
      </label>
    </>}
    {(challenge || invitation) && <label className="block text-sm">{ar ? "كود الدخول" : tr ? "Giriş kodu" : "Sign-in code"}
      <input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} dir="ltr" className="mt-1 w-full rounded-lg border p-2 text-center text-xl tracking-widest" />
    </label>}
    {(challenge || invitation) ? <button type="button" disabled={busy || code.length !== 6 || (invitation && !contact)} onClick={() => void verify()} className="w-full rounded-lg bg-burgundy px-4 py-3 text-white disabled:opacity-50">{busy ? "…" : link ? ar ? "تحقق وربط" : tr ? "Doğrula ve Bağla" : "Verify and link" : ar ? "دخول" : tr ? "Giriş Yap" : "Sign in"}</button>
      : <button type="button" disabled={busy || !contact || wait > 0} onClick={() => void requestCode()} className="w-full rounded-lg bg-burgundy px-4 py-3 text-white disabled:opacity-50">{busy ? "…" : wait ? `${wait}s` : ar ? "إرسال كود الدخول" : tr ? "Giriş Kodu Gönder" : "Send sign-in code"}</button>}
    {challenge && <button type="button" disabled={busy} onClick={() => { setChallenge(null); setCode(""); setMessage(""); }} className="text-sm underline">{ar ? "تغيير البيانات أو طلب كود جديد" : tr ? "Bilgileri Değiştir veya Yeni Kod İste" : "Change details or request a new code"}</button>}
    {!link && !challenge && <button type="button" disabled={busy} onClick={() => setInvitation(!invitation)} className="block text-sm underline">{invitation ? ar ? "طلب كود جديد" : tr ? "Yeni Kod İste" : "Request a new code" : ar ? "لدي كود دخول بالفعل" : tr ? "Zaten giriş kodum var" : "I already have a sign-in code"}</button>}
    <p role="status" aria-live="polite" className="text-sm text-gray-700">{message}</p>
  </section>;
}
