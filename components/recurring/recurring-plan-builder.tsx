"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProjectRecord } from "@/data/projects";
import { recurringFrequencies, recurringFunds, type RecurringFrequency } from "@/data/recurring";

type Destination = {
  id: string;
  title: string;
  region: string;
  description: string;
  kind: "fund" | "project";
  slug?: string;
  proofStatus: string;
};

const labels: Record<RecurringFrequency, string> = { daily: "يومي", friday: "كل جمعة", monthly: "شهري" };
const focusable = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function estimate(frequency: RecurringFrequency, amount: number) {
  if (frequency === "daily") return { monthly: amount * 30, annual: amount * 365 };
  if (frequency === "friday") return { monthly: amount * 4.33, annual: amount * 52 };
  return { monthly: amount, annual: amount * 12 };
}

export function RecurringPlanBuilder({ projects }: { projects: ProjectRecord[] }) {
  const destinations = useMemo<Destination[]>(() => [
    ...recurringFunds.map((fund) => ({ ...fund, kind: "fund" as const })),
    ...projects.map((project) => ({
      id: project.id,
      title: project.title.ar,
      region: project.region === "gaza" ? "غزة" : project.region === "al-quds" ? "القدس" : project.region === "al-aqsa" ? "الأقصى" : "مشروع رسمي",
      description: project.summary.ar,
      kind: "project" as const,
      slug: project.slug,
      proofStatus: project.image ? "صورة ميدانية مرتبطة بالمشروع" : "الوسائط تُضاف بعد اعتمادها",
    })),
  ], [projects]);

  const [frequency, setFrequency] = useState<RecurringFrequency>("friday");
  const [amount, setAmount] = useState(50);
  const [custom, setCustom] = useState("");
  const [destinationId, setDestinationId] = useState("recurring-most-needed");
  const [start, setStart] = useState("after-confirmation");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [step, setStep] = useState(1);
  const sheetRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const frequencyRecord = recurringFrequencies.find((item) => item.id === frequency)!;
  const selectedAmount = custom ? Number(custom) : amount;
  const destination = destinations.find((item) => item.id === destinationId);
  const valid = Boolean(destination) && Number.isFinite(selectedAmount) && selectedAmount > 0;
  const estimates = estimate(frequency, valid ? selectedAmount : 0);

  useEffect(() => {
    setCustom("");
    setAmount(recurringFrequencies.find((item) => item.id === frequency)!.amounts[frequency === "friday" ? 1 : 0]);
  }, [frequency]);

  useEffect(() => {
    const handler = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      if (destinations.some((item) => item.id === id)) {
        setDestinationId(id);
        document.getElementById("recurring-plan-builder")?.scrollIntoView({ behavior: "smooth" });
      }
    };
    window.addEventListener("minber:select-recurring-destination", handler);
    return () => window.removeEventListener("minber:select-recurring-destination", handler);
  }, [destinations]);

  useEffect(() => {
    if (!mobileOpen || !sheetRef.current) return;
    const dialog = sheetRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const list = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusable));
    window.setTimeout(() => list()[0]?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = list();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [mobileOpen]);

  const payload = () => ({
    intent: "recurring",
    intentLabel: "عطاء مستمر",
    donationMode: "recurring",
    frequency: labels[frequency],
    amount: selectedAmount,
    currency: "USD",
    fundId: destination?.kind === "fund" ? destination.id : undefined,
    projectId: destination?.kind === "project" ? destination.id : undefined,
    slug: destination?.slug,
    project: destination?.title,
    startPreference: start,
    estimatedMonthly: Number(estimates.monthly.toFixed(2)),
    estimatedAnnual: Number(estimates.annual.toFixed(2)),
    source: "recurring-page",
    receiptType: "recurring",
  });

  const addToBasket = () => {
    if (!valid || !destination) {
      setMessage("اختر الجهة والمبلغ قبل المتابعة.");
      return;
    }
    window.dispatchEvent(new CustomEvent("minber:add-to-basket", { detail: payload() }));
    setMessage("تمت إضافة خطة العطاء إلى السلة.");
    setToast(true);
    window.setTimeout(() => setToast(false), 2200);
  };

  const checkout = () => {
    if (!valid || !destination) {
      setMessage("اختر الجهة والمبلغ قبل المتابعة.");
      return;
    }
    window.dispatchEvent(new CustomEvent("minber:add-to-basket", { detail: payload() }));
    window.location.assign("/checkout");
  };

  const frequencyField = (
    <fieldset>
      <legend>1. اختر الدورية</legend>
      <div className="recurring-choice-grid">
        {recurringFrequencies.map((item) => (
          <button type="button" key={item.id} aria-pressed={frequency === item.id} className={frequency === item.id ? "is-selected" : ""} onClick={() => setFrequency(item.id)}>
            <strong>{item.label}</strong><small>{item.description}</small>
          </button>
        ))}
      </div>
    </fieldset>
  );

  const destinationField = (
    <fieldset>
      <legend>2. اختر جهة العطاء</legend>
      <div className="recurring-destinations">
        {destinations.map((item) => (
          <button type="button" key={item.id} aria-pressed={destinationId === item.id} className={destinationId === item.id ? "is-selected" : ""} onClick={() => setDestinationId(item.id)}>
            <span>{item.kind === "fund" ? "صندوق عام" : "مشروع رسمي"}</span>
            <strong>{item.title}</strong>
            <small>{item.region} · {item.proofStatus}</small>
          </button>
        ))}
      </div>
    </fieldset>
  );

  const amountField = (
    <fieldset>
      <legend>3. اختر المبلغ · USD</legend>
      <div className="recurring-amount-grid">
        {frequencyRecord.amounts.map((value) => (
          <button type="button" key={value} aria-pressed={!custom && amount === value} className={!custom && amount === value ? "is-selected" : ""} onClick={() => { setAmount(value); setCustom(""); }}>{value} USD</button>
        ))}
      </div>
      <label className="recurring-custom"><span>مبلغ آخر</span><input inputMode="decimal" value={custom} onChange={(event) => setCustom(event.target.value.replace(/[^0-9.]/g, ""))} aria-invalid={Boolean(custom) && !valid} /><b>USD</b></label>
      {Boolean(custom) && !valid ? <small className="field-error">أدخل مبلغًا صحيحًا أكبر من صفر.</small> : null}
    </fieldset>
  );

  const startField = (
    <fieldset>
      <legend>4. بداية الخطة</legend>
      <div className="recurring-start-options">
        {[["after-confirmation", "بعد تأكيد العملية"], ["next-month", "بداية الشهر القادم"]].map(([id, label]) => (
          <button type="button" key={id} aria-pressed={start === id} className={start === id ? "is-selected" : ""} onClick={() => setStart(id)}>{label}</button>
        ))}
      </div>
      <p className="builder-help">تراجع تاريخ البداية والدورية قبل تأكيد العملية.</p>
    </fieldset>
  );

  const summary = (
    <aside className="recurring-plan-summary" aria-live="polite">
      <span>ملخص خطتك</span>
      <dl>
        <div><dt>الدورية</dt><dd>{labels[frequency]}</dd></div>
        <div><dt>المبلغ لكل عملية</dt><dd>{valid ? selectedAmount : 0} USD</dd></div>
        <div><dt>الجهة</dt><dd>{destination?.title || "اختر جهة"}</dd></div>
        <div><dt>بداية الخطة</dt><dd>{start === "after-confirmation" ? "بعد التأكيد" : "بداية الشهر القادم"}</dd></div>
        <div><dt>التقدير الشهري</dt><dd>{estimates.monthly.toFixed(2)} USD تقريبًا</dd></div>
        <div><dt>التقدير السنوي</dt><dd>{estimates.annual.toFixed(2)} USD تقريبًا</dd></div>
      </dl>
      <p>التقديرات إرشادية، ويتغير العدد الفعلي للعمليات حسب تاريخ بداية الخطة.</p>
      {message ? <p className="recurring-message" role="status">{message}</p> : null}
      <Button type="button" fullWidth onClick={checkout} disabled={!valid}>المتابعة لتفعيل الخطة</Button>
      <Button type="button" variant="outline" fullWidth onClick={addToBasket} disabled={!valid}>أضف الخطة إلى سلة العطاء</Button>
    </aside>
  );

  return (
    <>
      <div className="recurring-builder-desktop"><div className="recurring-builder-fields">{frequencyField}{destinationField}{amountField}{startField}</div>{summary}</div>
      <div className="recurring-builder-mobile">
        <div className="recurring-mobile-step"><span>الخطوة {step} من 5</span>{step === 1 ? frequencyField : step === 2 ? destinationField : step === 3 ? amountField : step === 4 ? startField : summary}</div>
        <div className="recurring-mobile-step-actions"><Button type="button" variant="outline" disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))}>السابق</Button><Button type="button" disabled={step === 5} onClick={() => setStep((current) => Math.min(5, current + 1))}>التالي</Button></div>
      </div>
      <div className="recurring-context-bar"><div><small>{labels[frequency]}</small><strong>{valid ? `${selectedAmount} USD` : "اختر مبلغًا"}</strong></div><button ref={triggerRef} type="button" onClick={() => setMobileOpen(true)}>راجع خطتك</button></div>
      {mobileOpen ? <div className="recurring-sheet-layer"><button className="recurring-sheet-backdrop" type="button" onClick={() => setMobileOpen(false)} aria-label="إغلاق مراجعة الخطة" /><aside ref={sheetRef} className="recurring-sheet" role="dialog" aria-modal="true" aria-labelledby="recurring-sheet-title"><header><div><span>خطة عطاء مستمر</span><h2 id="recurring-sheet-title">راجع خطتك</h2></div><button type="button" onClick={() => setMobileOpen(false)} aria-label="إغلاق">×</button></header><div className="recurring-sheet-scroll">{frequencyField}{destinationField}{amountField}{startField}{summary}</div></aside></div> : null}
      <div className={toast ? "toast is-visible" : "toast"} role="status" aria-live="polite">تمت إضافة خطة العطاء إلى السلة</div>
    </>
  );
}

export function RecurringProjectSelectButton({ id }: { id: string }) {
  return <Button type="button" variant="outline" size="small" onClick={() => window.dispatchEvent(new CustomEvent("minber:select-recurring-destination", { detail: { id } }))}>اختر لهذا العطاء</Button>;
}

export function RecurringManagementPreview() {
  return (
    <div className="recurring-management-card">
      <div className="management-heading"><div><span>إدارة الخطة من حسابك</span><h3>تحكم واضح في عطائك المستمر</h3></div></div>
      <ul><li>مراجعة الدورية والمبلغ والجهة</li><li>تحديث طريقة الدفع بعد ربط النظام</li><li>إيقاف الخطة مؤقتًا أو إنهاؤها من الحساب</li><li>الوصول إلى سجل العمليات والتقارير</li></ul>
      <Button href="/account/recurring" variant="outline">عرض صفحة الخطط المستمرة</Button>
    </div>
  );
}