"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currencies } from "@/config/currencies";

type QuickIntent = {
  label: string;
  kind: "zakat" | "waqf" | "urgent" | "general";
};

const quickIntents: QuickIntent[] = [
  { label: "حيث الحاجة أشد", kind: "general" },
  { label: "زكاة", kind: "zakat" },
  { label: "وقف", kind: "waqf" },
  { label: "إغاثة غزة", kind: "urgent" },
];

const quickAmounts = [25, 50, 100, 250];

export function QuickGiving() {
  const [intent, setIntent] = useState(quickIntents[0]);
  const [amount, setAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [added, setAdded] = useState(false);
  const selectedAmount = customAmount ? Math.max(0, Number(customAmount) || 0) : amount;

  const addToBasket = () => {
    if (selectedAmount <= 0) return;
    window.dispatchEvent(new CustomEvent("minber:add-to-basket", {
      detail: {
        intent: intent.kind,
        intentLabel: intent.label,
        project: intent.label,
        amount: selectedAmount,
        currency,
        frequency: "مرة واحدة",
      },
    }));
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
  };

  return (
    <section className="quick-giving-v4" id="donate" aria-labelledby="quick-giving-title">
      <div className="site-container quick-giving-v4__shell">
        <div className="quick-giving-v4__heading">
          <span>عطاء سريع</span>
          <h2 id="quick-giving-title">اختر نيتك ومبلغك</h2>
          <p>أضف مساهمتك إلى السلة، ثم راجع تفاصيلها قبل المتابعة.</p>
        </div>

        <div className="quick-giving-v4__form" role="group" aria-label="أداة العطاء السريع">
          <fieldset>
            <legend>نية العطاء</legend>
            <div className="quick-giving-v4__choices quick-giving-v4__choices--intent">
              {quickIntents.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  className={intent.label === item.label ? "is-active" : ""}
                  aria-pressed={intent.label === item.label}
                  onClick={() => setIntent(item)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>المبلغ</legend>
            <div className="quick-giving-v4__choices quick-giving-v4__choices--amount">
              {quickAmounts.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={!customAmount && amount === value ? "is-active" : ""}
                  aria-pressed={!customAmount && amount === value}
                  onClick={() => {
                    setAmount(value);
                    setCustomAmount("");
                  }}
                >
                  {value}
                </button>
              ))}
              <label className="quick-giving-v4__custom">
                <span>مبلغ آخر</span>
                <input
                  inputMode="decimal"
                  value={customAmount}
                  onChange={(event) => setCustomAmount(event.target.value)}
                  aria-label="أدخل مبلغًا آخر"
                />
              </label>
            </div>
          </fieldset>

          <label className="quick-giving-v4__currency">
            <span>العملة</span>
            <select value={currency} onChange={(event) => setCurrency(event.target.value)} aria-label="عملة العطاء السريع">
              {currencies.filter((item) => item.enabled).map((item) => (
                <option key={item.code} value={item.code}>{item.code} · {item.symbol}</option>
              ))}
            </select>
          </label>

          <div className="quick-giving-v4__action">
            <Button type="button" onClick={addToBasket} disabled={selectedAmount <= 0}>
              <span>متابعة إلى السلة</span>
              <ArrowLeft size={18} aria-hidden="true" />
            </Button>
            <p role="status" aria-live="polite">{added ? "أُضيفت المساهمة إلى سلة العطاء." : "يمكنك تعديل النية والمبلغ داخل السلة."}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
