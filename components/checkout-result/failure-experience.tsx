"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useBasket } from "@/components/basket/use-basket";
import { calculateBasketTotals } from "@/components/basket/basket-utils";
import { siteConfig } from "@/config/site";

const reasons = [
  "تحتاج بيانات المتبرع أو النيات إلى مراجعة.",
  "لم تُفعّل بوابة الدفع الرسمية بعد.",
  "خرج المستخدم من رحلة الإتمام قبل حفظ المراجعة.",
  "تحتاج طريقة الدفع المختارة إلى التحقق من التوافق.",
];

export function FailureExperience() {
  const { items, hydrated } = useBasket();
  const totals = useMemo(() => calculateBasketTotals(items), [items]);

  if (!hydrated) return <div role="status">جارٍ تحميل سلة العطاء…</div>;

  if (!items.length) {
    return (
      <main id="main-content" className="result-page">
        <section className="result-guard-state">
          <div className="result-banner">تعذر استكمال المراجعة</div>
          <h1>لا توجد عناصر محفوظة في السلة</h1>
          <p>ابدأ باختيار مشروع أو مسار عطاء ثم عد إلى صفحة المراجعة.</p>
          <div className="result-actions"><Button href="/projects">استكشف المشاريع</Button><Button href="/zakat" variant="outline">احسب زكاتك</Button><Button href="/" variant="text">العودة للرئيسية</Button></div>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="result-page">
      <section>
        <div className="result-banner">لم تكتمل مراجعة التبرع</div>
        <h1>سلة عطائك ما زالت محفوظة</h1>
        <p>لم يتم خصم أي مبلغ. يمكنك العودة إلى السلة أو مراجعة البيانات من جديد.</p>
      </section>

      <section className="failure-reasons">
        <h2>ما الذي يحتاج إلى مراجعة؟</h2>
        <ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </section>

      <section className="result-summary">
        <h2>ملخص السلة الحالية</h2>
        <dl>
          <div><dt>العناصر</dt><dd>{items.length}</dd></div>
          <div><dt>المبلغ لمرة واحدة</dt><dd>{totals.amountDueNow.toLocaleString("en-US")} USD</dd></div>
          <div><dt>الخطط المستمرة</dt><dd>{totals.recurringPlans.length}</dd></div>
        </dl>
      </section>

      <section className="result-actions">
        <Button href="/checkout">مراجعة البيانات مرة أخرى</Button>
        <Button href="/basket" variant="outline">العودة إلى سلة العطاء</Button>
      </section>

      <section className="support-module">
        <span>التواصل مع المؤسسة</span>
        <h2>تحتاج إلى مساعدة؟</h2>
        <p>تواصل مباشرة مع فريق المؤسسة عبر البريد أو الهاتف.</p>
        <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>
        {siteConfig.phones.map((phone) => <a key={phone} href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>)}
      </section>
    </main>
  );
}