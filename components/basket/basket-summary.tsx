import type { BasketItem } from "@/types/basket";
import { Button } from "@/components/ui/button";
import { calculateCurrencyTotals, formatBasketAmount } from "./basket-utils";

function donationCountLabel(count: number) {
  return count === 1 ? "تبرع واحد" : `${count.toLocaleString("ar")} تبرعات`;
}

export function BasketSummary({
  items,
  actionHref,
  invalidCount = 0,
  incompleteCount = 0,
  compact = false,
}: {
  items: BasketItem[];
  actionHref: string;
  invalidCount?: number;
  incompleteCount?: number;
  compact?: boolean;
}) {
  const totals = calculateCurrencyTotals(items);
  const unavailableCount = items.filter((item) => item.available === false).length;
  const blocked = invalidCount > 0 || incompleteCount > 0 || unavailableCount > 0;
  const reason = invalidCount > 0
    ? "أدخل مبلغًا صحيحًا قبل المتابعة."
    : unavailableCount > 0
      ? "أزل المشروع غير المتاح قبل المتابعة."
      : incompleteCount > 0
        ? "أكمل البيانات المطلوبة قبل المتابعة."
        : "";

  return (
    <section className={`basket-review-summary${compact ? " basket-review-summary--compact" : ""}`} aria-labelledby={compact ? "drawer-basket-summary-title" : "basket-summary-title"}>
      <div className="basket-review-summary__heading">
        <div><span>عدد التبرعات</span><strong>{donationCountLabel(items.length)}</strong></div>
        <div className="basket-review-summary__totals">
          <span id={compact ? "drawer-basket-summary-title" : "basket-summary-title"}>إجمالي التبرعات</span>
          {totals.map((total) => <strong key={total.currency}>{formatBasketAmount(total.amount)} <b>{total.currency}</b></strong>)}
        </div>
      </div>
      {totals.length > 1 ? <p className="basket-currency-note">إجمالي كل عملة يظهر منفصلًا.</p> : null}
      {reason ? <p className="basket-summary-blocked" role="status">{reason}</p> : null}
      <Button href={actionHref} fullWidth disabled={blocked}>متابعة</Button>
    </section>
  );
}
