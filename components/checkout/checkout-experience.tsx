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
  const intentions = useMemo(() => getIntentionCounts(items), [items]);
  const incompleteItems = useMemo(() => items.filter(needsSensitiveDetails), [items]);
  const hasRecurring = totals.recurringPlans.length > 0;

  const set = (key: keyof DonorDetails, value: string) => {
    setDonor((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = () => {
    const next: DonorErrors = {};
    if (!donor.firstName.trim()) next.firstName = "الاسم الأول مطلوب.";
    if (!donor.lastName.trim()) next.lastName = "اسم العائلة مطلوب.";
    if (!donor.email.trim()) next.email = "البريد الإلكتروني مطلوب.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donor.email)) next.email = "صيغة البريد الإلكتروني غير صحيحة.";
    if (!donor.country) next.country = "الدولة مطلوبة.";
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
      setReviewError("راجع الملخص ووافق على السياسة قبل المتابعة.");
      return;
    }
    setCheckoutSnapshot({
      paymentMethod: method,
      amountDueNow: totals.amountDueNow,
      recurringPlanCount: totals.recurringPlans.length,
      intentionCount: Object.keys(intentions).length,
      documentCount: documents.length,
      currency: "USD",
      status: "prototype-only",
    });
    router.push("/checkout/success");
  };

  if (!hydrated) return <div role="status">جارٍ استعادة سلة العطاء…</div>;

  if (!items.length) {
    return <section className="checkout-empty-state"><h1>لا توجد عناصر جاهزة للمراجعة</h1><p>أضف مساهمة إلى سلة العطاء قبل بدء رحلة الإتمام.</p><div><Button href="/basket">العودة إلى السلة</Button><Button href="/projects" variant="outline">استكشف المشاريع</Button><Button href="/zakat" variant="outline">احسب زكاتك</Button></div></section>;
  }

  if (incompleteItems.length) {
    return <section className="checkout-empty-state checkout-sensitive-state"><span>حماية الخصوصية</span><h1>تحتاج بعض التفاصيل إلى استكمال</h1><p>أكمل بيانات صاحب الوقف أو الإهداء من سلة العطاء قبل المتابعة.</p><ul>{incompleteItems.map((item) => <li key={item.id}>{item.projectTitle} · التفاصيل غير مكتملة</li>)}</ul><div><Button href="/basket">استكمال التفاصيل</Button><Button href="/projects" variant="outline">استكشف المشاريع</Button></div></section>;
  }

  const receiptName = orgReceipt && donor.organization.trim()
    ? donor.organization
    : `${donor.firstName} ${donor.lastName}`.trim() || "اسم المتبرع";

  const methodLabel = paymentMethods.find((item) => item.id === method)?.label;

  return (
    <>
      <section className="checkout-hero">
        <span>مراجعة التبرع</span>
        <h1>أكمل بياناتك وراجع عطائك</h1>
        <p>لا نطلب بيانات بطاقة قبل ربط بوابة الدفع الرسمية واعتماد وسائل الدفع المتاحة.</p>
        <ol className="checkout-progress checkout-progress--interactive">
          {checkoutSteps.map((item, index) => <li key={item.id} aria-current={step === index ? "step" : undefined}><button type="button" onClick={() => go(index)}><b>{index + 1}</b> {item.label}</button></li>)}
        </ol>
      </section>

      <div className="checkout-page-layout">
        <div className="checkout-steps-column">
          <section className={`checkout-step-panel ${step === 0 ? "is-active" : ""}`}>
            <header><span>الخطوة 1</span><h2>بيانات المتبرع</h2><p>تُستخدم لإعداد سجل التبرع والتواصل المرتبط بالعملية.</p></header>
            {Object.keys(errors).length ? <div className="checkout-error-summary" role="alert"><strong>راجع الحقول المطلوبة.</strong></div> : null}
            <div className="donor-form-grid">
              <label><span>الاسم الأول *</span><input ref={(node) => { refs.current.firstName = node; }} value={donor.firstName} onChange={(event) => set("firstName", event.target.value)} /><small>{errors.firstName}</small></label>
              <label><span>اسم العائلة *</span><input ref={(node) => { refs.current.lastName = node; }} value={donor.lastName} onChange={(event) => set("lastName", event.target.value)} /><small>{errors.lastName}</small></label>
              <label><span>البريد الإلكتروني *</span><input ref={(node) => { refs.current.email = node; }} type="email" value={donor.email} onChange={(event) => set("email", event.target.value)} /><small>{errors.email}</small></label>
              <label><span>الدولة *</span><select ref={(node) => { refs.current.country = node; }} value={donor.country} onChange={(event) => set("country", event.target.value)}><option value="">اختر الدولة</option>{checkoutCountries.map((country) => <option key={country}>{country}</option>)}</select><small>{errors.country}</small></label>
              <label><span>الهاتف — اختياري</span><input type="tel" value={donor.phone} onChange={(event) => set("phone", event.target.value)} /></label>
              <label><span>المدينة — اختياري</span><input value={donor.city} onChange={(event) => set("city", event.target.value)} /></label>
              <label><span>اللغة المفضلة</span><select value={donor.preferredLanguage} onChange={(event) => set("preferredLanguage", event.target.value)}>{checkoutLanguages.map((language) => <option key={language}>{language}</option>)}</select></label>
              <label><span>المؤسسة أو الشركة — اختياري</span><input value={donor.organization} onChange={(event) => set("organization", event.target.value)} /></label>
            </div>
            <div className="checkout-step-actions"><Button type="button" onClick={() => go(1)}>متابعة إلى الوثائق</Button></div>
          </section>

          <section className={`checkout-step-panel ${step === 1 ? "is-active" : ""}`}>
            <header><span>الخطوة 2</span><h2>الإيصالات والإهداءات</h2><p>راجع أسماء المستفيدين والوثائق المرتبطة بنياتك.</p></header>
            <label><input type="checkbox" checked={orgReceipt} disabled={!donor.organization.trim()} onChange={(event) => setOrgReceipt(event.target.checked)} /> إصدار الإيصال باسم المؤسسة</label>
            <p>اسم المستلم: <strong>{receiptName}</strong></p>
            <div className="checkout-document-list">
              {documents.map((document) => (
                <article key={document.id}>
                  <span>بيانات الوثيقة</span><h3>{document.title}</h3><p>{document.description}</p>
                  {document.id === "zakat" ? <small>تبقى نية الزكاة مستقلة في سجل التبرع.</small> : null}
                  {document.id === "waqf" ? items.filter((item) => item.intent === "waqf").map((item) => <div key={item.id}><b>{item.ownerName}</b><span>{item.projectTitle}</span></div>) : null}
                  {document.id === "gift" ? items.filter((item) => item.donationMode === "gift").map((item) => <div key={item.id}><b>{item.giftRecipient}</b><span>{item.giftOccasion} · {maskEmail(item.giftEmail)}</span><p>{item.giftMessage}</p></div>) : null}
                  {document.id === "recurring" ? totals.recurringPlans.map((item) => <div key={item.id}><b>{getFrequencyLabel(item.frequency)} · {item.amount} USD</b><span>{item.projectTitle}</span></div>) : null}
                </article>
              ))}
            </div>
            <div className="checkout-step-actions"><Button type="button" variant="outline" onClick={() => go(0)}>السابق</Button><Button type="button" onClick={() => go(2)}>متابعة إلى طريقة الدفع</Button></div>
          </section>

          <section className={`checkout-step-panel ${step === 2 ? "is-active" : ""}`}>
            <header><span>الخطوة 3</span><h2>طريقة الدفع</h2><p>اختر الطريقة المفضلة لمراجعة توافقها مع نيات السلة.</p></header>
            <fieldset className="payment-methods">
              <legend>طرق الدفع المقترحة</legend>
              <div>{paymentMethods.map((paymentMethod) => <button key={paymentMethod.id} type="button" aria-pressed={method === paymentMethod.id} className={method === paymentMethod.id ? "is-selected" : ""} onClick={() => setMethod(paymentMethod.id)}><strong>{paymentMethod.label}</strong><small>{paymentMethod.description}</small></button>)}</div>
            </fieldset>
            <div className="payment-method-state">
              <strong>بوابة الدفع الرسمية قيد الربط</strong>
              <p>لن نطلب أو نخزن أي بيانات مالية داخل هذه الواجهة قبل تفعيل مزود الدفع المعتمد.</p>
              {hasRecurring ? <p>يجب أن تدعم الطريقة المختارة الخصم المتكرر للخطط المستمرة.</p> : null}
              {method === "bank" ? <p>تظهر بيانات التحويل البنكي بعد اعتمادها رسميًا من المؤسسة.</p> : null}
            </div>
            <div className="checkout-step-actions"><Button type="button" variant="outline" onClick={() => go(1)}>السابق</Button><Button type="button" onClick={() => go(3)}>متابعة إلى المراجعة</Button></div>
          </section>

          <section className={`checkout-step-panel ${step === 3 ? "is-active" : ""}`}>
            <header><span>الخطوة 4</span><h2>المراجعة النهائية</h2><p>تحقق من البيانات والنيات قبل حفظ ملخص العملية.</p></header>
            <div className="checkout-review-grid">
              <article><h3>بيانات المتبرع</h3><p>{donor.firstName} {donor.lastName}</p><p>{maskEmail(donor.email)}</p><p>{donor.country}</p></article>
              <article><h3>طريقة الدفع المختارة</h3><p>{methodLabel}</p><small>تتطلب التفعيل عبر بوابة الدفع الرسمية</small></article>
              <article><h3>النيات</h3>{Object.entries(intentions).map(([label, count]) => <p key={label}>{label}: {count}</p>)}</article>
              <article><h3>الوثائق المرتبطة</h3>{documents.map((document) => <p key={document.id}>{document.title}</p>)}</article>
            </div>
            <div className="checkout-consents">
              <label><input type="checkbox" checked={reviewOk} onChange={(event) => { setReviewOk(event.target.checked); setReviewError(""); }} /> راجعت بيانات التبرع والنيات والمبالغ.</label>
              <label><input type="checkbox" checked={policyOk} onChange={(event) => { setPolicyOk(event.target.checked); setReviewError(""); }} /> اطلعت على سياسة التبرع والخصوصية.</label>
              <button ref={policyTriggerRef} type="button" onClick={() => setPolicyOpen(true)}>عرض السياسة</button>
              <label><input type="checkbox" checked={updates} onChange={(event) => setUpdates(event.target.checked)} /> أرغب في تلقي تحديثات المشروع والأثر.</label>
            </div>
            {reviewError ? <p role="alert">{reviewError}</p> : null}
            <div className="checkout-final-actions"><Button type="button" variant="outline" onClick={() => go(2)}>السابق</Button><Button type="button" onClick={confirmReview}>حفظ ملخص التبرع</Button></div>
          </section>
        </div>

        <aside className="checkout-sticky-summary">
          <span>ملخص السلة</span><h2>ما ستراجعه</h2>
          <dl><div><dt>المبلغ لمرة واحدة</dt><dd>{totals.amountDueNow.toLocaleString("en-US")} USD</dd></div><div><dt>خطط مستمرة</dt><dd>{totals.recurringPlans.length}</dd></div><div><dt>عدد النيات</dt><dd>{Object.keys(intentions).length}</dd></div><div><dt>الوثائق المرتبطة</dt><dd>{documents.length}</dd></div></dl>
          {totals.recurringPlans.map((item) => <p key={item.id}>{item.amount} USD {getFrequencyLabel(item.frequency)} · {item.projectTitle}</p>)}
        </aside>
      </div>

      <div className="checkout-mobile-bar">
        <Button type="button" variant="outline" disabled={step === 0} onClick={() => go(step - 1)}>السابق</Button>
        <div><span>الخطوة {step + 1} من 4</span><strong>{checkoutSteps[step].label}</strong></div>
        {step < 3 ? <Button type="button" onClick={() => go(step + 1)}>التالي</Button> : <Button type="button" onClick={confirmReview}>حفظ الملخص</Button>}
      </div>

      <CheckoutPolicyDialog open={policyOpen} onClose={() => setPolicyOpen(false)} openerRef={policyTriggerRef} />
    </>
  );
}