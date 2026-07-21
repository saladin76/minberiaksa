"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useBasket } from "@/components/basket/use-basket";
import { calculateBasketTotals, getBasketDocuments, getFrequencyLabel, getIntentionCounts } from "@/components/basket/basket-utils";
import { paymentMethods } from "@/data/checkout";

export function SuccessExperience() {
  const router = useRouter();
  const { items, hydrated, checkoutSnapshot, clearBasket } = useBasket();
  const [message, setMessage] = useState("");
  const totals = useMemo(() => calculateBasketTotals(items), [items]);
  const documents = useMemo(() => getBasketDocuments(items), [items]);
  const intentions = useMemo(() => getIntentionCounts(items), [items]);
  const payment = paymentMethods.find((method) => method.id === checkoutSnapshot?.paymentMethod)?.label ?? "طريقة تجريبية غير محددة";
  if (!hydrated) return <div role="status">جارٍ تحميل ملخص المعاينة…</div>;
  if (!checkoutSnapshot || checkoutSnapshot.status !== "prototype-only" || !items.length) return <main id="main-content" className="result-page"><section className="result-guard-state"><div className="result-banner">Prototype route guard</div><h1>لا توجد معاينة مكتملة</h1><p>ابدأ من سلة العطاء وأكمل خطوات Checkout لعرض نتيجة المعاينة.</p><div className="result-actions"><Button href="/basket">العودة إلى سلة العطاء</Button><Button href="/projects" variant="outline">استكشف المشاريع</Button></div></section></main>;
  return <main id="main-content" className="result-page">
    <section><div className="result-banner">Prototype Success Preview · لم تتم معالجة أي دفعة حقيقية</div><h1>اكتملت معاينة عطائك بنجاح</h1><p>في النسخة التشغيلية ستظهر هنا نتيجة الدفع والإيصالات والشهادات وخيارات متابعة الأثر.</p><code>PREVIEW-DONATION-0001</code></section>
    <section className="result-summary"><h2>ملخص النتيجة</h2><dl><div><dt>المبلغ لمرة واحدة</dt><dd>{totals.amountDueNow.toLocaleString("en-US")} USD</dd></div><div><dt>نيات التبرع</dt><dd>{Object.keys(intentions).length}</dd></div><div><dt>خطط مستمرة</dt><dd>{totals.recurringPlans.length}</dd></div><div><dt>وسيلة الدفع</dt><dd>{payment}</dd></div><div><dt>الحالة</dt><dd>Prototype only</dd></div></dl>{totals.recurringPlans.map((plan) => <p key={plan.id}>{plan.amount} USD {getFrequencyLabel(plan.frequency)} · {plan.projectTitle}</p>)}</section>
    <section className="result-documents"><h2>الوثائق التي ستصدر</h2><div className="result-doc-grid">{documents.map((document) => <article key={document.id}><h3>{document.title}</h3><p>سيُنشأ بعد الدفع الحقيقي</p><Button href="/account/documents?demo=1" variant="outline" size="small">معاينة في الحساب</Button><button type="button" disabled>Download</button></article>)}</div></section>
    <section className="result-actions"><Button href="/account/impact?demo=1">معاينة أثر عطائك</Button><Button href="/projects" variant="outline">استكشف مشروعًا آخر</Button><Button href="/" variant="text">العودة للرئيسية</Button><button type="button" onClick={() => setMessage("المشاركة لن تتضمن مبلغًا أو أسماء أو بيانات شخصية.")}>شارك أنك ساهمت في الخير — Prototype</button></section>
    {message ? <p role="status">{message}</p> : null}
    <section className="result-actions"><h2>إنهاء المعاينة</h2><p>لن تُمسح السلة إلا يدويًا.</p><Button type="button" onClick={() => { clearBasket(); router.push("/"); }}>إنهاء المعاينة والعودة للرئيسية</Button></section>
  </main>;
}
