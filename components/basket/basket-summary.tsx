import type { BasketItem } from "@/types/basket";
import { calculateBasketTotals, getFrequencyLabel } from "./basket-utils";

export function BasketSummary({ items }: { items: BasketItem[] }) {
  const totals = calculateBasketTotals(items);
  return <aside className="basket-order-summary" aria-labelledby="basket-summary-title">
    <span>ملخص مالي واضح</span><h2 id="basket-summary-title">ملخص سلة العطاء</h2>
    <dl>
      <div><dt>تبرعات لمرة واحدة</dt><dd>{totals.oneTimeAmount.toLocaleString("en-US")} USD</dd></div>
      <div><dt>الزكاة</dt><dd>{totals.zakatAmount.toLocaleString("en-US")} USD</dd></div>
      <div><dt>الأوقاف</dt><dd>{totals.waqfAmount.toLocaleString("en-US")} USD</dd></div>
      <div><dt>صدقات وإغاثة لمرة واحدة</dt><dd>{totals.generalOneTimeAmount.toLocaleString("en-US")} USD</dd></div>
      <div><dt>الإهداءات</dt><dd>{totals.giftAmount.toLocaleString("en-US")} USD</dd></div>
      <div className="basket-due-now"><dt>المبلغ المتوقع دفعه الآن</dt><dd>{totals.amountDueNow.toLocaleString("en-US")} USD</dd></div>
    </dl>
    <div className="basket-recurring-summary"><h3>الخطط التي ستبدأ لاحقًا</h3>{totals.recurringPlans.length ? totals.recurringPlans.map((plan) => <p key={plan.id}><strong>{plan.amount} USD</strong> {getFrequencyLabel(plan.frequency)} · {plan.projectTitle}</p>) : <p>لا توجد خطط مستمرة في السلة.</p>}</div>
    <small>لا توجد رسوم إضافية معروضة في هذا النموذج التجريبي. الخطط المستمرة لا تُجمع داخل مبلغ الدفع لمرة واحدة.</small>
  </aside>;
}
