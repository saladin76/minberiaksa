"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useBasket } from "@/components/basket/use-basket";
import { calculateBasketTotals, getBasketDocuments, getFrequencyLabel, getIntentionCounts } from "@/components/basket/basket-utils";
import { paymentMethods } from "@/data/checkout";

export function SuccessExperience() {
  const router = useRouter();
  const { items, hydrated, checkoutSnapshot, clearBasket } = useBasket();
  const totals = useMemo(() => calculateBasketTotals(items), [items]);
  const documents = useMemo(() => getBasketDocuments(items), [items]);
  const donations = useMemo(() => getIntentionCounts(items), [items]);
  const payment = paymentMethods.find((method) => method.id === checkoutSnapshot?.paymentMethod)?.label ?? "لم تُحدد طريقة الدفع";

  if (!hydrated) return <div role="status">جارٍ تحميل ملخص التبرع…</div>;

  if (!checkoutSnapshot || checkoutSnapshot.status !== "prototype-only" || !items.length) {
    return (
      <main id="main-content" className="result-page">
        <section className="result-guard-state">
          <div className="result-banner">مراجعة التبرع</div>
          <h1>لا توجد بيانات محفوظة</h1>
          <p>ارجع إلى سلة التبرعات وراجع بياناتك قبل المتابعة.</p>
          <div className="result-actions"><Button href="/basket">العودة إلى السلة</Button><Button href="/projects" variant="outline">استكشف المشاريع</Button></div>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="result-page">
      <section>
        <div className="result-banner">تم حفظ المراجعة</div>
        <h1>راجع بيانات التبرع</h1>
        <p>لم يتم خصم أي مبلغ. هذه الصفحة تعرض البيانات التي أدخلتها قبل ربط الدفع.</p>
      </section>

      <section className="result-summary">
        <h2>ملخص التبرع</h2>
        <dl>
          <div><dt>المبلغ لمرة واحدة</dt><dd>{totals.amountDueNow.toLocaleString("en-US")} USD</dd></div>
          <div><dt>أنواع التبرع</dt><dd>{Object.keys(donations).length}</dd></div>
          <div><dt>التبرعات الدورية</dt><dd>{totals.recurringPlans.length}</dd></div>
          <div><dt>طريقة الدفع</dt><dd>{payment}</dd></div>
          <div><dt>الحالة</dt><dd>الدفع غير متاح حاليًا</dd></div>
        </dl>
        {totals.recurringPlans.map((plan) => <p key={plan.id}>{plan.amount} USD {getFrequencyLabel(plan.frequency)} · {plan.projectTitle}</p>)}
      </section>

      {documents.length ? (
        <section className="result-documents">
          <h2>الوثائق</h2>
          <div className="result-doc-grid">
            {documents.map((document) => <article key={document.id}><h3>{document.title}</h3><p>تظهر الوثيقة بعد إتمام الدفع واعتمادها.</p></article>)}
          </div>
        </section>
      ) : null}

      <section className="result-actions">
        <Button href="/basket">العودة إلى السلة</Button>
        <Button href="/projects" variant="outline">استكشف مشاريع أخرى</Button>
        <Button href="/impact" variant="text">عرض التقارير والتحديثات</Button>
      </section>

      <section className="result-actions">
        <h2>مسح السلة</h2>
        <p>سيؤدي ذلك إلى حذف التبرعات المحفوظة في السلة.</p>
        <Button type="button" variant="outline" onClick={() => { clearBasket(); router.push("/"); }}>مسح السلة والعودة إلى الرئيسية</Button>
      </section>
    </main>
  );
}
