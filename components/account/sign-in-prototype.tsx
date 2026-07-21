"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export function SignInPrototype() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const ended = params.get("ended") === "1";
  const send = () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) { setMessage("أدخل صيغة بريد مناسبة للمعاينة فقط."); emailRef.current?.focus(); return; }
    setSent(true);
    setMessage("في النسخة التشغيلية سيتم إرسال رمز آمن إلى بريدك الإلكتروني. لم يتم إرسال أي شيء الآن.");
  };
  return <main id="main-content" className="account-sign-in-page"><div className="account-sign-in-shell">
    <header><a href="/" aria-label={siteConfig.nameAr}><BrandMark compact/><span><strong>{siteConfig.nameAr}</strong><small>حساب العطاء</small></span></a><a href="/">العودة للموقع</a></header>
    {ended ? <p className="account-ended-message" role="status">انتهت معاينة الحساب التجريبي.</p> : null}
    <section className="account-sign-in-card"><span>Frontend Prototype</span><h1>ادخل إلى حساب عطائك</h1><p>تابع تبرعاتك وإيصالاتك وشهاداتك وتحديثات أثر المشاريع من مكان واحد.</p>
      <form onSubmit={(event) => { event.preventDefault(); sent ? router.push("/account?demo=1") : send(); }}>
        <fieldset><legend>الدخول عبر البريد الإلكتروني</legend><label><span>البريد الإلكتروني</span><input ref={emailRef} type="email" autoComplete="off" value={email} onChange={(event) => { setEmail(event.target.value); setMessage(""); }} placeholder="name@example.com"/></label><Button type="button" onClick={send}>إرسال رمز الدخول</Button></fieldset>
        {sent ? <fieldset className="account-code-state"><legend>رمز تجريبي من 6 أرقام</legend><p>لا يوجد رمز حقيقي ولا تتم مطابقة القيمة مع أي خدمة.</p><label><span>الرمز التجريبي</span><input inputMode="numeric" value={code} maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000"/></label><Button type="submit">فتح الحساب التجريبي</Button></fieldset> : null}
      </form>
      {message ? <p role="status" aria-live="polite">{message}</p> : null}
      <a className="account-demo-access" href="/account?demo=1">متابعة لمعاينة الحساب دون تسجيل</a>
      <div className="account-auth-required"><strong>AUTHENTICATION FLOW REQUIRED</strong><ul><li>وصول آمن مستقبلًا دون كلمة مرور.</li><li>بياناتك لا تظهر للمتبرعين الآخرين.</li><li>الحساب يجمع التبرعات والوثائق والتحديثات.</li></ul></div>
      <small>لا يتم حفظ البريد أو الرمز في التخزين أو URL أو Console، ولا توجد Network Request.</small>
    </section>
  </div></main>;
}
