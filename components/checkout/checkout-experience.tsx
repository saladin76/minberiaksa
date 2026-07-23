"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useBasket } from "@/components/basket/use-basket";
import { calculateBasketTotals, getBasketDocuments, getFrequencyLabel, getIntentionCounts, maskEmail } from "@/components/basket/basket-utils";
import { checkoutCountries, checkoutLanguages, checkoutSteps, paymentMethods } from "@/data/checkout";
import type { CheckoutPaymentMethod, DonorDetails, DonorErrors } from "@/types/checkout";
import type { BasketItem } from "@/types/basket";
import { CheckoutPolicyDialog } from "./checkout-policy-dialog";

const empty: DonorDetails = {
  firstName: "",
  lastName: "",
  email: "",
  country: "",
  phone: "",
  city: "",
  preferredLanguage: "العربية",
  organization: "",
};

const needsSensitiveDetails = (item: BasketItem) => Boolean(item.metadata?.sensitiveDetailsExpired)
  || (item.intent === "waqf" && !item.ownerName?.trim())
  || (item.donationMode === "gift" && !item.giftRecipient?.trim());

export function CheckoutExperience() {
  const router = useRouter();
  const params = useSearchParams();
  const { items, hydrated, setCheckoutSnapshot } = useBasket();
  const [step, setStep] = useState(params.get("step") === "payment" ? 2 : 0);
  const [donor, setDonor] = useState(empty);
  const [errors, setErrors] = useState<DonorErrors>({});
  const [method, setMethod] = useState<CheckoutPaymentMethod>("card");
  const [orgReceipt, setOrgReceipt] = useState(false);
  const [reviewOk, setReviewOk] = useState(false);
  const [policyOk, setPolicyOk] = useState(false);
  const [updates, setUpdates] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const refs = useRef<Partial<Record<keyof DonorDetails, HTMLInputElement | HTMLSelectElement | null>>>({});
  const policyTriggerRef = useRef<HTMLButtonElement>(null);

  const totals = useMemo(() => calculateBasketTotals(items), [items]);
  const documents = useMemo(() => getBasketDocuments(items), [items]);
  const donationTypes = useMemo(() => getIntentionCounts(items), [items]);
  const incompleteItems = useMemo(() => items.filter(needsSensitiveDetails), [items]);
  const hasRecurring = totals.recurringPlans.length > 0;

  const set = (key: keyof DonorDetails, value: string) => {
    setDonor((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = () => {
    const next: DonorErrors = {};
    if (!donor.firstName.trim()) next.firstName = "أدخل اسمك الأول.";
    if (!donor.lastName.trim()) next.lastName = "أدخل اسم العائلة.";
    if (!donor.email.trim()) next.email = "أدخل بريدك الإلكتروني.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donor.email)) next.email = "أدخل بريدًا إلكترونيًا صحيحًا.";
    if (!donor.country) next.country = "اختر الدولة.";
    setErrors(next);
    const first = (Object.keys(next) as (keyof DonorDetails)[])[0];
    if (first) window.requestAnimationFrame(() => refs.current[first]?.focus());
    return !first;
  };

  const go = (next: number) => {
    if (next > 0 && !validate()) {
      setStep(0);
      return;
    }
    setStep(Math.max(0, Math.min(3, next)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmReview = () => {
    if (!validate()) {
      setStep(0);
      return;
    }
    if (!reviewOk || !policyOk) {
      setReviewError("راجع البيانات ووافق على سياسة التبرع قبل المتابعة.");
      return;
    }
    setCheckoutSnapshot({
      paymentMethod: method,
      amountDueNow: totals.amountDueNow,
      recurringPlanCount: totals.recurringPlans.length,
      intentionCount: Object.keys(donationTypes).length,
      documentCount: documents.length,
      currency: "USD",
      status: "prototype-only",
    });
    router.push("/checkout/success");
  };

  if (!hydrated) return <div role="status">جارٍ تحميل سلة التبرعات…</div>;

  if (!items.length) {
    return <section className="checkout-empty-state"><h1>سلتك فارغة</h1><p>اختر مشروعًا وحدد المبلغ، ثم أضفه إلى السلة.</p><div><Button href="/projects">استكشف المشاريع</Button><Button href="/zakat" variant="outline">احسب زكاتك</Button></div></section>;
  }

  if (incompleteItems.length) {
    return <section className="checkout-empty-state checkout-sensitive-state"><span>بيانات ناقصة</span><h1>أكمل البيانات قبل المتابعة</h1><p>راجع بيانات الوقف أو الإهداء داخل السلة.</p><ul>{incompleteItems.map((item) => <li key={item.id}>{item.projectTitle} · يحتاج إلى تعديل</li>)}</ul><div><Button href="/basket">العودة إلى السلة</Button></div></section>;
  }

  const receiptName = orgReceipt && donor.organization.trim()
    ? donor.organization
    : `${donor.firstName} ${donor.lastName}`.trim() || "اسم المتبرع";

  const methodLabel = paymentMethods.find((item) => item.id === method)?.label;

  return (
    <>
      <section className="checkout-hero">
        <span>مراجعة التبرع</span>
        <h1>راجع بياناتك قبل الدفع</h1>
        <p>أكمل بيانات المتبرع، ثم راجع التبرعات وطريقة الدفع.</p>
        <ol className="checkout-progress checkout-progress--interactive">
          {checkoutSteps.map((item, index) => <li key={item.id} aria-current={step === index ? "step" : undefined}><button type="button" onClick={() => go(index)}><b>{index + 1}</b> {item.label}</button></li>)}
        </ol>
      </section>

      <div className="checkout-page-layout">
        <div className="checkout-steps-column">
          <section className={`checkout-step-panel ${step === 0 ? "is-active" : ""}`}>
            <header><span>الخطوة 1</span><h2>بيانات المتبرع</h2><p>اكتب بياناتك الأساسية لإكمال المراجعة.</p></header>
            {Object.keys(errors).length ? <div className="checkout-error-summary" role="alert"><strong>تحقق من البيانات المدخلة.</strong></div> : null}
            <div className="donor-form-grid">
              <label><span>الاسم الأول</span><input ref={(node) => { refs.current.firstName = node; }} value={donor.firstName} onChange={(event) => set("firstName", event.target.value)} /><small>{errors.firstName}</small></label>
              <label><span>اسم العائلة</span><input ref={(node) => { refs.current.lastName = node; }} value={donor.lastName} onChange={(event) => set("lastName", event.target.value)} /><small>{errors.lastName}</small></label>
              <label><span>البريد الإلكتروني</span><input ref={(node) => { refs.current.email = node; }} type="email" value={donor.email} onChange={(event) => set("email", event.target.value)} /><small>{errors.email}</small></label>
              <label><span>الدولة</span><select ref={(node) => { refs.current.country = node; }} value={donor.country} onChange={(event) => set("country", event.target.value)}><option value="">اختر الدولة</option>{checkoutCountries.map((country) => <option key={country}>{country}</option>)}</select><small>{errors.country}</small></label>
              <label><span>رقم الهاتف — اختياري</span><input type="tel" value={donor.phone} onChange={(event) => set("phone", event.target.value)} /></label>
              <label><span>المدينة — اختياري</span><input value={donor.city} onChange={(event) => set("city", event.target.value)} /></label>
              <label><span>اللغة المفضلة</span><select value={donor.preferredLanguage} onChange={(event) => set("preferredLanguage", event.target.value)}>{checkoutLanguages.map((language) => <option key={language}>{language}</option>)}</select></label>
              <label><span>اسم المؤسسة — اختياري</span><input value={donor.organization} onChange={(event) => set("organization", event.target.value)} /></label>
            </div>
            <div className="checkout-step-actions"><Button type="button" onClick={() => go(1)}>متابعة</Button></div>
          </section>

          <section className={`checkout-step-panel ${step === 1 ? "is-active" : ""}`}>
            <header><span>الخطوة 2</span><h2>الإيصالات والإهداءات</h2><p>راجع الاسم الذي سيظهر على الوثائق المتاحة.</p></header>
            <label><input type="checkbox" checked={orgReceipt} disabled={!donor.organization.trim()} onChange={(event) => setOrgReceipt(event.target.checked)} /> إصدار الإيصال باسم المؤسسة</label>
            <p>الاسم: <strong>{receiptName}</strong></p>
            <div className="checkout-document-list">
              {documents.map((document) => (
                <article key={document.id}>
                  <span>وثيقة مرتبطة بالتبرع</span><h3>{document.title}</h3><p>{document.description}</p>
                  {document.id === "zakat" ? <small>سيُسجل هذا التبرع كزكاة.</small> : null}
                  {document.id === "waqf" ? items.filter((item) => item.intent === "waqf").map((item) => <div key={item.id}><b>{item.ownerName}</b><span>{item.projectTitle}</span></div>) : null}
                  {document.id === "gift" ? items.filter((item) => item.donationMode === "gift").map((item) => <div key={item.id}><b>{item.giftRecipient}</b><span>{item.giftOccasion} · {maskEmail(item.giftEmail)}</span><p>{item.giftMessage}</p></div>) : null}
                  {document.id === "recurring" ? totals.recurringPlans.map((item) => <div key={item.id}><b>{getFrequencyLabel(item.frequency)} · {item.amount} USD</b><span>{item.projectTitle}</span></div>) : null}
                </article>
              ))}
            </div>
            <div className="checkout-step-actions"><Button type="button" variant="outline" onClick={() => go(0)}>رجوع</Button><Button type="button" onClick={() => go(2)}>متابعة</Button></div>
          </section>

          <section className={`checkout-step-panel ${step === 2 ? "is-active" : ""}`}>
            <header><span>الخطوة 3</span><h2>طريقة الدفع</h2><p>اختر طريقة الدفع المتاحة.</p></header>
            <fieldset className="payment-methods">
              <legend>طرق الدفع</legend>
              <div>{paymentMethods.map((paymentMethod) => <button key={paymentMethod.id} type="button" aria-pressed={method === paymentMethod.id} className={method === paymentMethod.id ? "is-selected" : ""} onClick={() => setMethod(paymentMethod.id)}><strong>{paymentMethod.label}</strong><small>{paymentMethod.description}</small></button>)}</div>
            </fieldset>
            <div className="payment-method-state">
              <strong>الدفع غير متاح حاليًا</strong>
              <p>لن تُطلب بيانات مالية قبل تفعيل طريقة دفع معتمدة.</p>
              {hasRecurring ? <p>التبرع الدوري يحتاج إلى طريقة دفع تدعم التكرار.</p> : null}
              {method === "bank" ? <p>تظهر بيانات التحويل البنكي بعد اعتمادها.</p> : null}
            </div>
            <div className="checkout-step-actions"><Button type="button" variant="outline" onClick={() => go(1)}>رجوع</Button><Button type="button" onClick={() => go(3)}>متابعة</Button></div>
          </section>

          <section className={`checkout-step-panel ${step === 3 ? "is-active" : ""}`}>
            <header><span>الخطوة 4</span><h2>مراجعة التبرع</h2><p>راجع البيانات والمبالغ قبل المتابعة.</p></header>
            <div className="checkout-review-grid">
              <article><h3>بيانات المتبرع</h3><p>{donor.firstName} {donor.lastName}</p><p>{maskEmail(donor.email)}</p><p>{donor.country}</p></article>
              <article><h3>طريقة الدفع</h3><p>{methodLabel}</p><small>غير مفعلة حاليًا</small></article>
              <article><h3>أنواع التبرع</h3>{Object.entries(donationTypes).map(([label, count]) => <p key={label}>{label}: {count}</p>)}</article>
              <article><h3>الوثائق</h3>{documents.map((document) => <p key={document.id}>{document.title}</p>)}</article>
            </div>
            <div className="checkout-consents">
              <label><input type="checkbox" checked={reviewOk} onChange={(event) => { setReviewOk(event.target.checked); setReviewError(""); }} /> راجعت بيانات التبرع والمبالغ.</label>
              <label><input type="checkbox" checked={policyOk} onChange={(event) => { setPolicyOk(event.target.checked); setReviewError(""); }} /> اطلعت على سياسة التبرع والخصوصية.</label>
              <button ref={policyTriggerRef} type="button" onClick={() => setPolicyOpen(true)}>عرض السياسة</button>
              <label><input type="checkbox" checked={updates} onChange={(event) => setUpdates(event.target.checked)} /> أرغب في تلقي تحديثات المشروع.</label>
            </div>
            {reviewError ? <p role="alert">{reviewError}</p> : null}
            <div className="checkout-final-actions"><Button type="button" variant="outline" onClick={() => go(2)}>رجوع</Button><Button type="button" onClick={confirmReview}>حفظ المراجعة</Button></div>
          </section>
        </div>

        <aside className="checkout-sticky-summary">
          <span>ملخص السلة</span><h2>إجمالي التبرعات</h2>
          <dl><div><dt>المبلغ لمرة واحدة</dt><dd>{totals.amountDueNow.toLocaleString("en-US")} USD</dd></div><div><dt>التبرعات الدورية</dt><dd>{totals.recurringPlans.length}</dd></div><div><dt>أنواع التبرع</dt><dd>{Object.keys(donationTypes).length}</dd></div><div><dt>الوثائق</dt><dd>{documents.length}</dd></div></dl>
          {totals.recurringPlans.map((item) => <p key={item.id}>{item.amount} USD {getFrequencyLabel(item.frequency)} · {item.projectTitle}</p>)}
        </aside>
      </div>

      <div className="checkout-mobile-bar">
        <Button type="button" variant="outline" disabled={step === 0} onClick={() => go(step - 1)}>رجوع</Button>
        <div><span>الخطوة {step + 1} من 4</span><strong>{checkoutSteps[step].label}</strong></div>
        {step < 3 ? <Button type="button" onClick={() => go(step + 1)}>متابعة</Button> : <Button type="button" onClick={confirmReview}>حفظ المراجعة</Button>}
      </div>

      <CheckoutPolicyDialog open={policyOpen} onClose={() => setPolicyOpen(false)} openerRef={policyTriggerRef} />
    </>
  );
}
