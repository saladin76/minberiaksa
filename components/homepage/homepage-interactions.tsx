"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { funds, reels } from "@/data/homepage";

type Intent = {
  label: string;
  kind: "zakat" | "waqf" | "urgent" | "general";
};

const intents: Intent[] = [
  { label: "زكاة", kind: "zakat" },
  { label: "وقف", kind: "waqf" },
  { label: "إغاثة غزة", kind: "urgent" },
  { label: "دعم الأقصى", kind: "general" },
  { label: "دعم القدس", kind: "general" },
  { label: "حيث الحاجة أشد", kind: "general" },
  { label: "عطاء مستمر", kind: "general" },
];

const frequencies = ["مرة واحدة", "يومي", "كل جمعة", "شهري"];
const amounts = [25, 50, 100, 250];

export function QuickDonation() {
  const [intent, setIntent] = useState(intents[5]);
  const [frequency, setFrequency] = useState(frequencies[0]);
  const [amount, setAmount] = useState(100);
  const [custom, setCustom] = useState("");
  const [toast, setToast] = useState(false);
  const selected = custom ? Math.max(0, Number(custom) || 0) : amount;

  const add = () => {
    window.dispatchEvent(
      new CustomEvent("minber:add-to-basket", {
        detail: {
          intent: intent.kind,
          intentLabel: intent.label,
          project: intent.label,
          amount: selected,
          currency: "USD",
          frequency,
        },
      }),
    );
    setToast(true);
    window.setTimeout(() => setToast(false), 2200);
  };

  return (
    <section className="home-section quick-donation" id="donate" aria-labelledby="quick-title">
      <div className="site-container">
        <div className="section-heading-row">
          <div>
            <span className="section-eyebrow">ابدأ عطائك</span>
            <h2 id="quick-title">نية واضحة، مبلغ مناسب، وخطوة واحدة إلى السلة</h2>
            <p>اختر مسار عطائك ودوريته، ثم راجع التفاصيل قبل الانتقال إلى إتمام التبرع.</p>
          </div>
        </div>

        <div className="quick-grid">
          <div className="quick-controls">
            <fieldset>
              <legend>نية العطاء</legend>
              <div className="choice-wrap">
                {intents.map((item) => (
                  <button
                    type="button"
                    key={item.label}
                    className={intent.label === item.label ? "choice is-selected" : "choice"}
                    aria-pressed={intent.label === item.label}
                    onClick={() => setIntent(item)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>الدورية</legend>
              <div className="choice-wrap">
                {frequencies.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={frequency === item ? "choice is-selected" : "choice"}
                    aria-pressed={frequency === item}
                    onClick={() => setFrequency(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>المبلغ · USD</legend>
              <div className="choice-wrap amount-choices">
                {amounts.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={!custom && amount === item ? "choice is-selected" : "choice"}
                    aria-pressed={!custom && amount === item}
                    onClick={() => {
                      setAmount(item);
                      setCustom("");
                    }}
                  >
                    {item}
                  </button>
                ))}
                <label className="custom-amount">
                  <span>مبلغ آخر</span>
                  <input
                    inputMode="decimal"
                    value={custom}
                    onChange={(event) => setCustom(event.target.value)}
                    aria-label="مبلغ آخر بالدولار"
                  />
                </label>
              </div>
            </fieldset>
          </div>

          <aside className="donation-summary" aria-live="polite">
            <span>ملخص عطائك</span>
            <dl>
              <div><dt>النية</dt><dd>{intent.label}</dd></div>
              <div><dt>الدورية</dt><dd>{frequency}</dd></div>
              <div><dt>المبلغ</dt><dd>{selected} USD</dd></div>
            </dl>
            <p>ستتمكن من مراجعة المسار والمبلغ مرة أخرى داخل سلة العطاء.</p>
            <Button fullWidth onClick={add} disabled={selected <= 0}>أضف إلى سلة العطاء</Button>
            <Button href="/basket" variant="outline" fullWidth>راجع السلة</Button>
          </aside>
        </div>

        <div className={toast ? "toast is-visible" : "toast"} role="status" aria-live="polite">
          تمت إضافة عطائك إلى السلة
        </div>
      </div>
    </section>
  );
}

export function FundsSelector() {
  const [active, setActive] = useState<(typeof funds)[number]>(funds[0]);

  return (
    <div className="funds-layout">
      <div className={`fund-feature fund-feature--${active.tone}`}>
        <span>{active.kind}</span>
        <h3>{active.title}</h3>
        <p>{active.description}</p>
        <Button href="#donate" variant="outline">اختر هذا المسار</Button>
      </div>
      <div className="fund-list" role="list">
        {funds.map((fund) => (
          <button
            type="button"
            role="listitem"
            key={fund.id}
            className={active.id === fund.id ? "fund-row is-selected" : "fund-row"}
            onClick={() => setActive(fund)}
            aria-pressed={active.id === fund.id}
          >
            <span>{fund.kind}</span>
            <strong>{fund.title}</strong>
            <small>{fund.description}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ZakatCalculator() {
  const [cash, setCash] = useState("");
  const [gold, setGold] = useState("");
  const [trade, setTrade] = useState("");
  const [debts, setDebts] = useState("");
  const [calculated, setCalculated] = useState(false);
  const base = Math.max(
    0,
    [cash, gold, trade].reduce((sum, value) => sum + (Number(value) || 0), 0) - (Number(debts) || 0),
  );
  const zakat = calculated ? base * 0.025 : 0;
  const fields: [string, string, (value: string) => void][] = [
    ["النقد والمدخرات", cash, setCash],
    ["الذهب والفضة", gold, setGold],
    ["الاستثمارات والتجارة", trade, setTrade],
    ["الالتزامات قصيرة الأجل", debts, setDebts],
  ];

  return (
    <div className="zakat-tool">
      <div className="zakat-fields">
        {fields.map(([label, value, setter]) => (
          <label key={label}>
            <span>{label}</span>
            <div>
              <input inputMode="decimal" value={value} onChange={(event) => setter(event.target.value)} />
              <b>USD</b>
            </div>
          </label>
        ))}
      </div>
      <aside className="zakat-result">
        <small>حساب تقديري للمساعدة في تحديد المبلغ، ولا يُعد فتوى شرعية.</small>
        <dl>
          <div><dt>صافي المال الزكوي</dt><dd>{base.toFixed(2)} USD</dd></div>
          <div><dt>الزكاة التقديرية</dt><dd>{zakat.toFixed(2)} USD</dd></div>
        </dl>
        <label className="check-row">
          <input type="checkbox" />
          <span>أنوي هذا المبلغ زكاة</span>
        </label>
        <Button fullWidth onClick={() => setCalculated(true)}>احسب زكاتك</Button>
        <Button href="/zakat" variant="text">افتح حاسبة الزكاة الكاملة</Button>
      </aside>
    </div>
  );
}

export function WaqfBuilder() {
  const [type, setType] = useState("مساهمة مفتوحة");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(250);

  return (
    <div className="waqf-layout">
      <div className="waqf-controls">
        <div className="choice-wrap">
          {["مساهمة مفتوحة", "إهداء وقف", "تمويل مرحلة"].map((item) => (
            <button
              type="button"
              key={item}
              className={type === item ? "choice is-selected" : "choice"}
              onClick={() => setType(item)}
              aria-pressed={type === item}
            >
              {item}
            </button>
          ))}
        </div>
        <label>
          <span>مبلغ المساهمة</span>
          <input type="number" min="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
        </label>
        <label>
          <span>اسم صاحب الوقف أو المهدى إليه</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="اكتب الاسم كما سيظهر في الشهادة" />
        </label>
        <p className="helper">ستراجع جميع التفاصيل قبل إضافتها إلى سلة العطاء.</p>
        <Button href="/waqf">تابع إنشاء الوقف</Button>
      </div>

      <div className="certificate-preview" aria-label="معاينة أولية لشهادة الوقف">
        <span className="certificate-line" />
        <small>معاينة شهادة الوقف</small>
        <div className="certificate-logo">منبر الأقصى</div>
        <p>تشهد مؤسسة منبر الأقصى الدولية بأن</p>
        <h3>{name || "اسم صاحب الوقف"}</h3>
        <p>له مساهمة في: <strong>{type}</strong></p>
        <b>{amount} USD</b>
        <span className="certificate-status">تصدر الشهادة النهائية بعد إتمام المساهمة واعتماد بياناتها.</span>
      </div>
    </div>
  );
}

const recurringOptions = {
  يومي: [1, 3, 5],
  "كل جمعة": [10, 25, 50],
  شهري: [25, 50, 100],
} as const;

export function RecurringGivingTool() {
  const [frequency, setFrequency] = useState<keyof typeof recurringOptions>("كل جمعة");
  const [amount, setAmount] = useState(25);
  const options = recurringOptions[frequency];

  return (
    <div className="recurring-tool">
      <div>
        <div className="choice-wrap">
          {Object.keys(recurringOptions).map((item) => (
            <button
              type="button"
              key={item}
              className={frequency === item ? "choice is-selected" : "choice"}
              aria-pressed={frequency === item}
              onClick={() => {
                const nextFrequency = item as keyof typeof recurringOptions;
                setFrequency(nextFrequency);
                setAmount(recurringOptions[nextFrequency][1]);
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="recurring-amounts">
          {options.map((item) => (
            <button
              type="button"
              key={item}
              className={amount === item ? "is-selected" : ""}
              aria-pressed={amount === item}
              onClick={() => setAmount(item)}
            >
              <strong>{item}</strong>
              <span>USD</span>
            </button>
          ))}
        </div>
      </div>
      <aside>
        <span>اختيارك</span>
        <strong>{amount} USD</strong>
        <p>{frequency}</p>
        <ul>
          <li>خطة واضحة قابلة للإدارة</li>
          <li>سجل مستقل لكل مساهمة</li>
          <li>ربط بالمشروع والتحديثات</li>
        </ul>
        <Button href="/recurring" fullWidth>أنشئ خطة عطاء</Button>
      </aside>
    </div>
  );
}

export function ReelsExperience() {
  const [active, setActive] = useState(0);
  const reel = reels[active];

  return (
    <div className="reels-layout">
      <div className="featured-reel">
        <div className="reel-poster" aria-label="غلاف قصة ميدانية">
          <span>قصة ميدانية</span>
          <a href="/stories" aria-label={`فتح قصة ${reel[0]}`}>▶</a>
        </div>
        <div>
          <span>{reel[1]} · {reel[2]}</span>
          <h3>{reel[0]}</h3>
          <p>قصة مرتبطة بمشروع وتحديث ميداني، وتظهر مادتها المرئية بعد اعتمادها للنشر.</p>
          <Button href="/stories" variant="outline">استكشف القصص</Button>
          <Button href="#donate" variant="text">ادعم مشروعًا مرتبطًا</Button>
        </div>
      </div>
      <div className="reel-strip">
        {reels.map((item, index) => (
          <button
            type="button"
            key={item[0]}
            className={index === active ? "reel-card is-selected" : "reel-card"}
            onClick={() => setActive(index)}
            aria-pressed={index === active}
          >
            <span className="mini-poster">▶</span>
            <small>{item[1]} · {item[2]}</small>
            <strong>{item[0]}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
