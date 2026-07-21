"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useBasket } from "@/components/basket/use-basket";
import { calculateBasketTotals } from "@/components/basket/basket-utils";
import { siteConfig } from "@/config/site";

const reasons = ["لم يتم تأكيد وسيلة الدفع.", "انتهت جلسة الدفع.", "أُلغي الانتقال قبل الإكمال.", "تحتاج البيانات إلى مراجعة."];
export function FailureExperience() {
  const { items, hydrated } = useBasket();
  const totals = useMemo(() => calculateBasketTotals(items), [items]);
  if (!hydrated) return <div role="status">جارٍ تحميل السلة المحفوظة…</div>;
  if (!items.length) return <main id="main-content" className="result-page"><section className="result-guard-state"><div className="result-banner">Prototype Failure Preview</div><h1>لا توجد عناصر محفوظة للمحاولة</h1><p>لم توجد سلة تجريبية يمكن إعادة محاولة تأكيدها.</p><div className="result-actions"><Button href="/projects">استكشف المشاريع</Button><Button href="/zakat" variant="outline">احسب زكاتك</Button><Button href="/" variant="text">العودة للرئيسية</Button></div></section></main>;
  return <main id="main-content" className="result-page">
    <section><div className="result-banner">Prototype Failure Preview</div><h1>لم تكتمل عملية التأكيد</h1><p>لم تتم معالجة أي دفعة، وما زالت عناصر سلة العطاء محفوظة داخل هذه الجلسة التجريبية.</p></section>
    <section className="failure-reasons"><h2>ما الذي قد يحتاج مراجعة؟</h2><ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><small>لا تمثل هذه الأسباب رفضًا مصرفيًا أو خطأً ماليًا حقيقيًا.</small></section>
    <section className="result-summary"><h2>السلة محفوظة</h2><dl><div><dt>العناصر</dt><dd>{items.length}</dd></div><div><dt>المبلغ لمرة واحدة</dt><dd>{totals.amountDueNow.toLocaleString("en-US")} USD</dd></div><div><dt>الخطط المستمرة</dt><dd>{totals.recurringPlans.length}</dd></div></dl></section>
    <section className="result-actions"><Button href="/checkout">إعادة المحاولة</Button><Button href="/basket" variant="outline">مراجعة سلة العطاء</Button><Button href="/checkout?step=payment" variant="text">استخدام طريقة أخرى</Button></section>
    <section className="support-module"><span>SUPPORT FLOW REQUIRED</span><h2>هل تحتاج مساعدة؟</h2><p>لا يوجد Live Chat أو إرسال رسالة داخل النموذج.</p><a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>{siteConfig.phones.map((phone) => <a key={phone} href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>)}</section>
  </main>;
}
