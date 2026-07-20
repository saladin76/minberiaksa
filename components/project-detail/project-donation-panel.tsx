"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DonationType, ProjectRecord } from "@/data/projects";
import type { ProjectMetric } from "@/data/project-metrics";

const donationLabels: Record<DonationType, string> = { sadaqah: "صدقة", zakat: "زكاة", waqf: "وقف", recurring: "تبرع مستمر", qurbani: "أضاحي" };
const modeLabels = { "one-time": "مرة واحدة", recurring: "عطاء مستمر", gift: "إهداء تبرع" } as const;
type DonationMode = keyof typeof modeLabels;
type Frequency = "يومي" | "كل جمعة" | "شهري";
const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function ProjectDonationPanel({ project, metric, suggestedAmounts, acceptsGift }: { project: ProjectRecord; metric?: ProjectMetric; suggestedAmounts?: number[]; acceptsGift: boolean }) {
  const baseAmounts = useMemo(() => suggestedAmounts?.length ? suggestedAmounts : metric ? [metric.unitAmount, metric.unitAmount * 2, metric.unitAmount * 5] : [50, 100, 250, 500], [suggestedAmounts, metric]);
  const [mode, setMode] = useState<DonationMode>("one-time");
  const [intent, setIntent] = useState<DonationType>(project.donationTypes[0]);
  const [frequency, setFrequency] = useState<Frequency>("شهري");
  const [amount, setAmount] = useState(baseAmounts[0]);
  const [customAmount, setCustomAmount] = useState("");
  const [giftRecipient, setGiftRecipient] = useState("");
  const [giftEmail, setGiftEmail] = useState("");
  const [giftOccasion, setGiftOccasion] = useState("هدية عامة");
  const [giftMessage, setGiftMessage] = useState("");
  const [giftSender, setGiftSender] = useState("");
  const [waqfTarget, setWaqfTarget] = useState<"self" | "other">("self");
  const [waqfName, setWaqfName] = useState("");
  const [dedication, setDedication] = useState("");
  const [zakatConfirmed, setZakatConfirmed] = useState(false);
  const [qurbaniUnits, setQurbaniUnits] = useState(1);
  const [qurbaniName, setQurbaniName] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const [prototypeMessage, setPrototypeMessage] = useState("");
  const sheetRef = useRef<HTMLElement | null>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const recurringSupported = project.donationTypes.includes("recurring");
  const qurbaniSelected = intent === "qurbani";
  const selectedAmount = customAmount ? Number(customAmount) : amount;
  const amountValid = !qurbaniSelected && Number.isFinite(selectedAmount) && selectedAmount > 0;
  const amountError = customAmount && !amountValid ? "أدخل مبلغًا موجبًا صالحًا." : "";
  const giftValid = mode !== "gift" || (acceptsGift && giftRecipient.trim().length > 0);
  const waqfValid = intent !== "waqf" || waqfName.trim().length > 0;
  const zakatValid = intent !== "zakat" || zakatConfirmed;
  const recurringValid = mode !== "recurring" || recurringSupported;
  const canSubmit = amountValid && giftValid && waqfValid && zakatValid && recurringValid;
  const recurringAmounts = useMemo(() => {
    const monthlyBase = metric?.unitAmount || baseAmounts[0] || 100;
    if (frequency === "يومي") return [10, 25, 50];
    if (frequency === "كل جمعة") return [25, 50, 100];
    return [monthlyBase, monthlyBase * 2, monthlyBase * 5];
  }, [frequency, metric, baseAmounts]);
  const currentAmounts = mode === "recurring" ? recurringAmounts : baseAmounts;

  useEffect(() => { if (!currentAmounts.includes(amount) && !customAmount) setAmount(currentAmounts[0]); }, [currentAmounts, amount, customAmount]);
  useEffect(() => {
    if (!mobileOpen || !sheetRef.current) return;
    const dialog = sheetRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => !element.hasAttribute("disabled"));
    window.setTimeout(() => focusable()[0]?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMobileOpen(false); return; }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); mobileTriggerRef.current?.focus(); };
  }, [mobileOpen]);

  const selectMode = (nextMode: DonationMode) => {
    setMode(nextMode); setPrototypeMessage("");
    if (nextMode === "recurring" && recurringSupported) { setFrequency("شهري"); setCustomAmount(""); setAmount(metric?.unitAmount || baseAmounts[0] || 100); }
  };
  const addToBasket = () => {
    if (!canSubmit) return;
    window.dispatchEvent(new CustomEvent("minber:add-to-basket", { detail: {
      projectId: project.id, slug: project.slug,
      intent: intent === "zakat" ? "zakat" : intent === "waqf" ? "waqf" : project.tags.includes("emergency") ? "urgent" : "general",
      intentLabel: donationLabels[intent], project: project.title.ar, donationMode: mode,
      frequency: mode === "recurring" ? frequency : undefined, amount: selectedAmount, currency: "USD",
      giftData: mode === "gift" ? { recipient: giftRecipient, email: giftEmail, occasion: giftOccasion, message: giftMessage, sender: giftSender } : undefined,
      dedicationData: intent === "waqf" ? { target: waqfTarget, ownerName: waqfName, dedication } : undefined,
    } }));
    setToast(true); setPrototypeMessage("تمت إضافة التبرع التجريبي إلى سلة العطاء."); window.setTimeout(() => setToast(false), 2400);
  };
  const securePrototype = () => { if (canSubmit) setPrototypeMessage("سيتم الانتقال إلى Checkout بعد ربط نظام الدفع. لا يتم تنفيذ دفع حقيقي الآن."); };

  const renderFormContent = (mobile = false) => <div className={mobile ? "donation-form donation-form--mobile" : "donation-form"}>
    <fieldset className="donation-mode-selector"><legend>طريقة التبرع</legend><div>{(Object.keys(modeLabels) as DonationMode[]).map((item) => <button key={item} type="button" aria-pressed={mode === item} className={mode === item ? "is-selected" : ""} onClick={() => selectMode(item)}>{modeLabels[item]}</button>)}</div></fieldset>
    {mode === "recurring" && !recurringSupported ? <div className="donation-unavailable"><strong>هذا المشروع لا يدعم التبرع المتكرر حاليًا</strong><p>اختر مرة واحدة أو استكشف مشاريع تقبل العطاء المستمر.</p><Button href="/projects" variant="outline" size="small">استكشف المشاريع</Button></div> : <>
      <fieldset><legend>نية التبرع</legend><div className="donation-intents">{project.donationTypes.map((type) => <button type="button" key={type} aria-pressed={intent === type} className={intent === type ? "is-selected" : ""} onClick={() => { setIntent(type); setZakatConfirmed(false); }}>{donationLabels[type]}</button>)}</div></fieldset>
      {mode === "recurring" && <fieldset><legend>دورية العطاء</legend><div className="donation-frequency">{(["يومي", "كل جمعة", "شهري"] as Frequency[]).map((item) => <button type="button" key={item} aria-pressed={frequency === item} className={frequency === item ? "is-selected" : ""} onClick={() => { setFrequency(item); setCustomAmount(""); }}>{item}</button>)}</div></fieldset>}
      {qurbaniSelected ? <div className="qurbani-state"><strong>بيانات السعر مطلوبة</strong><p>لا يمكن حساب قيمة الأضحية أو إضافتها إلى السلة قبل اعتماد سعر الوحدة.</p><label><span>عدد الأسهم أو الوحدات</span><input type="number" min={1} value={qurbaniUnits} onChange={(event) => setQurbaniUnits(Math.max(1, Number(event.target.value) || 1))} /></label><label><span>اسم المضحي — اختياري</span><input value={qurbaniName} onChange={(event) => setQurbaniName(event.target.value)} /></label></div> : <fieldset><legend>اختر المبلغ · USD</legend><div className="donation-amounts">{currentAmounts.map((value) => <button type="button" key={value} aria-pressed={!customAmount && amount === value} className={!customAmount && amount === value ? "is-selected" : ""} onClick={() => { setAmount(value); setCustomAmount(""); }}>{value}</button>)}</div><label className="donation-custom-amount"><span>مبلغ آخر</span><input inputMode="decimal" value={customAmount} onChange={(event) => setCustomAmount(event.target.value.replace(/[^0-9.]/g, ""))} aria-invalid={Boolean(amountError)} aria-describedby={amountError ? "donation-amount-error" : undefined} /></label>{amountError && <small id="donation-amount-error" className="field-error">{amountError}</small>}</fieldset>}
      {intent === "zakat" && <div className="zakat-donation-state"><span>يقبل الزكاة</span><label><input type="checkbox" checked={zakatConfirmed} onChange={(event) => setZakatConfirmed(event.target.checked)} />أنوي هذا المبلغ زكاة</label><p>سيتم إصدار إيصال زكاة منفصل في التجربة الكاملة.</p>{!zakatConfirmed && <small className="field-error">أكد نية الزكاة قبل الإضافة إلى السلة.</small>}</div>}
      {intent === "waqf" && <div className="waqf-donation-state"><fieldset><legend>صاحب الوقف</legend><div><button type="button" aria-pressed={waqfTarget === "self"} className={waqfTarget === "self" ? "is-selected" : ""} onClick={() => setWaqfTarget("self")}>عني</button><button type="button" aria-pressed={waqfTarget === "other"} className={waqfTarget === "other" ? "is-selected" : ""} onClick={() => setWaqfTarget("other")}>عن شخص آخر</button></div></fieldset><label><span>اسم صاحب الوقف</span><input value={waqfName} onChange={(event) => setWaqfName(event.target.value)} required /></label><label><span>إهداء أو نية الوقف</span><textarea value={dedication} onChange={(event) => setDedication(event.target.value.slice(0, 180))} maxLength={180} /></label>{!waqfName.trim() && <small className="field-error">اسم صاحب الوقف مطلوب لمعاينة الشهادة.</small>}<div className="waqf-certificate-mini"><small>معاينة شهادة وقف</small><strong>{waqfName || "اسم صاحب الوقف"}</strong><span>{dedication || "إهداء الوقف"}</span><code>PREVIEW-WAQF-0001</code></div></div>}
      {mode === "gift" && acceptsGift && <div className="gift-donation-state"><label><span>اسم المهدى إليه</span><input value={giftRecipient} onChange={(event) => setGiftRecipient(event.target.value)} required /></label><label><span>البريد الإلكتروني — اختياري</span><input type="email" value={giftEmail} onChange={(event) => setGiftEmail(event.target.value)} /></label><label><span>المناسبة</span><select value={giftOccasion} onChange={(event) => setGiftOccasion(event.target.value)}><option>هدية عامة</option><option>عن الوالدين</option><option>عن شخص عزيز</option><option>مناسبة خاصة</option><option>صدقة عن متوفى</option></select></label><label><span>رسالة قصيرة</span><textarea value={giftMessage} onChange={(event) => setGiftMessage(event.target.value.slice(0, 180))} maxLength={180} /><small>{giftMessage.length}/180</small></label><label><span>اسم المرسل — اختياري</span><input value={giftSender} onChange={(event) => setGiftSender(event.target.value)} /></label>{!giftRecipient.trim() && <small className="field-error">اسم المهدى إليه مطلوب للمعاينة.</small>}<div className="gift-preview"><small>معاينة بطاقة الإهداء</small><strong>{giftRecipient || "اسم المهدى إليه"}</strong><p>{project.title.ar}</p><blockquote>{giftMessage || "ستظهر رسالتك هنا"}</blockquote><span>{giftSender ? `من: ${giftSender}` : "اسم المرسل اختياري"}</span><code>PREVIEW-GIFT-0001</code></div></div>}
      <p className="donation-impact-line">يساهم تبرعك في دعم تنفيذ هذا المشروع وفق الأولويات الميدانية المعتمدة.</p>
      <div className="donation-summary" aria-live="polite"><span>ملخص التبرع</span><dl><div><dt>المشروع</dt><dd>{project.title.ar}</dd></div><div><dt>النية</dt><dd>{donationLabels[intent]}</dd></div><div><dt>الطريقة</dt><dd>{modeLabels[mode]}</dd></div>{mode === "recurring" && <div><dt>الدورية</dt><dd>{frequency}</dd></div>}<div><dt>المبلغ</dt><dd>{qurbaniSelected ? "بيانات مطلوبة" : `${amountValid ? selectedAmount : 0} USD`}</dd></div>{mode === "gift" && <div><dt>الإهداء</dt><dd>{giftRecipient || "غير مكتمل"}</dd></div>}</dl></div>
      {prototypeMessage && <p className="prototype-message" role="status" aria-live="polite">{prototypeMessage}</p>}
      <div className="donation-actions"><Button type="button" fullWidth onClick={securePrototype} disabled={!canSubmit}>تبرع بأمان</Button><Button type="button" variant="outline" fullWidth onClick={addToBasket} disabled={!canSubmit}>أضف إلى سلة العطاء</Button></div>
    </>}
  </div>;

  return <>
    <aside className="project-donation-panel" aria-label="لوحة التبرع للمشروع"><div className="donation-panel-heading"><span>تبرع لهذا المشروع</span><h2>{project.title.ar}</h2><p>Frontend Prototype — لا يتم تنفيذ دفع حقيقي.</p></div>{renderFormContent()}</aside>
    <div className="contextual-mobile-donate"><div><small>{project.title.ar}</small><strong>{qurbaniSelected ? "اختر وحدتك" : amountValid ? `${selectedAmount} USD` : "اختر مبلغك"}</strong></div><button ref={mobileTriggerRef} type="button" onClick={() => setMobileOpen(true)}>تبرع الآن</button></div>
    {mobileOpen && <div className="mobile-donation-layer"><button className="mobile-donation-backdrop" type="button" onClick={() => setMobileOpen(false)} aria-label="إغلاق لوحة التبرع" /><aside ref={sheetRef} className="mobile-donation-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-donation-title"><header><div><span>تبرع للمشروع</span><h2 id="mobile-donation-title">{project.title.ar}</h2></div><button type="button" onClick={() => setMobileOpen(false)} aria-label="إغلاق">×</button></header><div className="mobile-donation-scroll">{renderFormContent(true)}</div></aside></div>}
    <div className={toast ? "toast is-visible" : "toast"} role="status" aria-live="polite">تمت إضافة التبرع إلى سلة العطاء</div>
  </>;
}
