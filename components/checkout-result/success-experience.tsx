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
  const intentions = useMemo(() => getIntentionCounts(items), [items]);
  const payment = paymentMethods.find((method) => method.id === checkoutSnapshot?.paymentMethod)?.label ?? "لم تُحدد طريقة";

  if (!hydrated) return <div role="status">جارٍ تحميل ملخص التبرع…</div>;

  if (!checkoutSnapshot || checkoutSnapshot.status !== "prototype-only" || !items.length) {
    return (
      <main id="main-content" className="result-page">
        <section className="result-guard-state">
          <div className="result-banner">ملخص التبرع</div>
          <h1>لا توجد مراجعة محفوظة</h1>
          <p>ابدأ من سلة العطاء وأكمل البيانات والمراجعة لعرض الملخص.</p>
          <div className="result-actions"><Button href="/basket">العودة إلى سلة العطاء</Button><Button href="/projects" variant="outline">استكشف المشاريع</Button></div>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="result-page">
      <section>
        <div className="result-banner">تم حفظ مراجعة التبرع</div>
        <h1>بيانات عطائك جاهزة للربط ببوابة الدفع</h1>
        <p>لم يتم خصم أي مبلغ. يعرض هذا الملخص النيات والمبالغ والوثائق المرتبطة قبل تفعيل الدفع الرسمي.</p>
      </section>

      <section className="result-summary">
        <h2>ملخص المراجعة</h2>
        <dl>
          <div><dt>المبلغ لمرة واحدة</dt><dd>{totals.amountDueNow.toLocaleString("en-US")} USD</dd></div>
          <div><dt>نيات التبرع</dt><dd>{Object.keys(intentions).length}</dd></div>
          <div><dt>خطط مستمرة</dt><dd>{totals.recurringPlans.length}</dd></div>
          <div><dt>طريقة الدفع المختارة</dt><dd>{payment}</dd></div>
          <div><dt>الحالة</dt><dd>بانتظار تفعيل بوابة الدفع</dd></div>
        </dl>
        {totals.recurringPlans.map((plan) => <p key={plan.id}>{plan.amount} USD {getFrequencyLabel(plan.frequency)} · {plan.projectTitle}</p>)}
      </section>

      <section className="result-documents">
        <h2>الوثائق المرتبطة بالعملية</h2>
        <div className="result-doc-grid">
          {documents.map((document) => <article key={document.id}><h3>{document.title}</h3><p>تظهر النسخة النهائية بعد إتمام الدفع واعتماد العملية.</p></article>)}
        </div>
      </section>

      <section className="result-actions">
        <Button href="/basket">العودة إلى السلة</Button>
        <Button href="/projects" variant="outline">استكشف مشروعًا آخر</Button>
        <Button href="/account/impact" variant="text">مركز الأثر</Button>
      </section>

      <section className="result-actions">
        <h2>مسح الملخص الحالي</h2>
        <p>استخدم هذا الإجراء فقط عندما تنتهي من مراجعة السلة الحالية.</p>
        <Button type="button" variant="outline" onClick={() => { clearBasket(); router.push("/"); }}>مسح السلة والعودة للرئيسية</Button>
      </section>
    </main>
  );
}