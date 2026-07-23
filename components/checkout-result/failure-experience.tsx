"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useBasket } from "@/components/basket/use-basket";
import { calculateBasketTotals } from "@/components/basket/basket-utils";
import { siteConfig } from "@/config/site";

const reasons = [
  "راجع بيانات المتبرع.",
  "تحقق من المبلغ وطريقة الدفع.",
  "حاول مرة أخرى بعد مراجعة البيانات.",
];

export function FailureExperience() {
  const { items, hydrated } = useBasket();
  const totals = useMemo(() => calculateBasketTotals(items), [items]);

  if (!hydrated) return <div role="status">جارٍ تحميل سلة التبرعات…</div>;

  if (!items.length) {
    return (
      <main id="main-content" className="result-page">
        <section className="result-guard-state">
          <div className="result-banner">لم تكتمل العملية</div>
          <h1>سلتك فارغة</h1>
          <p>اختر مشروعًا وحدد المبلغ، ثم أضفه إلى السلة.</p>
          <div className="result-actions"><Button href="/projects">استكشف المشاريع</Button><Button href="/zakat" variant="outline">احسب زكاتك</Button><Button href="/" variant="text">العودة إلى الرئيسية</Button></div>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="result-page">
      <section>
        <div className="result-banner">لم تكتمل عملية الدفع</div>
        <h1>تعذر إتمام العملية</h1>
        <p>راجع بيانات الدفع أو حاول مرة أخرى. بقيت التبرعات محفوظة في السلة.</p>
      </section>

      <section className="failure-reasons">
        <h2>ما الذي يمكنك مراجعته؟</h2>
        <ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </section>

      <section className="result-summary">
        <h2>ملخص السلة</h2>
        <dl>
          <div><dt>عدد التبرعات</dt><dd>{items.length}</dd></div>
          <div><dt>المبلغ لمرة واحدة</dt><dd>{totals.amountDueNow.toLocaleString("en-US")} USD</dd></div>
          <div><dt>التبرعات الدورية</dt><dd>{totals.recurringPlans.length}</dd></div>
        </dl>
      </section>

      <section className="result-actions">
        <Button href="/checkout">المحاولة مرة أخرى</Button>
        <Button href="/basket" variant="outline">العودة إلى السلة</Button>
      </section>

      <section className="support-module">
        <span>المساعدة</span>
        <h2>تحتاج إلى مساعدة؟</h2>
        <p>تواصل مع فريق المؤسسة عبر البريد أو الهاتف.</p>
        <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>
        {siteConfig.phones.map((phone) => <a key={phone} href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>)}
      </section>
    </main>
  );
}
