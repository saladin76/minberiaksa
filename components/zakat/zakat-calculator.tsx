"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Project = { id: string; slug: string; title: string };
type Allocation = { id: number; target: string; amount: string };

const FIELDS = [
  "النقد والمدخرات",
  "الذهب والفضة",
  "الاستثمارات والتجارة",
  "المستحقات المتوقع تحصيلها",
  "أصول زكوية أخرى",
];

const clean = (value: string) => value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
const num = (value: string) => Number(value) || 0;
const focusable = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function ZakatCalculator({ projects }: { projects: Project[] }) {
  const [assets, setAssets] = useState<string[]>(FIELDS.map(() => ""));
  const [liabilities, setLiabilities] = useState("");
  const [nisab, setNisab] = useState("");
  const [custom, setCustom] = useState("");
  const [useEstimate, setUseEstimate] = useState(true);
  const [intent, setIntent] = useState(false);
  const [allocations, setAllocations] = useState<Allocation[]>([{ id: 1, target: "zakat-fund", amount: "" }]);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [step, setStep] = useState(1);
  const sheetRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const result = useMemo(() => {
    const total = assets.reduce((sum, value) => sum + num(value), 0);
    const net = Math.max(0, total - num(liabilities));
    return { total, net, zakat: net * 0.025 };
  }, [assets, liabilities]);

  const selected = useEstimate ? result.zakat : num(custom);
  const allocated = allocations.reduce((sum, allocation) => sum + num(allocation.amount), 0);
  const remaining = Math.max(0, selected - allocated);
  const exceeded = allocated > selected + 0.001;
  const targets = [{ id: "zakat-fund", title: "صندوق زكاة فلسطين" }, ...projects.map((project) => ({ id: project.id, title: project.title }))];
  const valid = selected > 0 && intent && allocated > 0 && !exceeded && allocations.every((allocation) => num(allocation.amount) > 0);

  useEffect(() => {
    if (useEstimate && allocations.length === 1 && allocations[0].target === "zakat-fund") {
      setAllocations([{ ...allocations[0], amount: result.zakat ? result.zakat.toFixed(2) : "" }]);
    }
  }, [result.zakat, useEstimate]);

  useEffect(() => {
    if (!sheet || !sheetRef.current) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const element = sheetRef.current;
    const items = () => Array.from(element.querySelectorAll<HTMLElement>(focusable));
    window.setTimeout(() => items()[0]?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSheet(false);
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = items();
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [sheet]);

  const setAsset = (index: number, value: string) => setAssets((current) => current.map((asset, itemIndex) => itemIndex === index ? clean(value) : asset));
  const updateAllocation = (id: number, patch: Partial<Allocation>) => setAllocations((current) => current.map((allocation) => allocation.id === id ? { ...allocation, ...patch } : allocation));
  const addRow = () => allocations.length < 3 && setAllocations((current) => [
    ...current,
    {
      id: Date.now(),
      target: projects.find((project) => !current.some((allocation) => allocation.target === project.id))?.id || "zakat-fund",
      amount: "",
    },
  ]);
  const fullFund = () => setAllocations([{ id: Date.now(), target: "zakat-fund", amount: selected ? selected.toFixed(2) : "" }]);
  const reset = () => {
    setAssets(FIELDS.map(() => ""));
    setLiabilities("");
    setNisab("");
    setCustom("");
    setUseEstimate(true);
    setIntent(false);
    setAllocations([{ id: Date.now(), target: "zakat-fund", amount: "" }]);
    setMessage("");
    setStep(1);
  };

  const pushToBasket = () => {
    allocations.forEach((allocation) => {
      const project = projects.find((item) => item.id === allocation.target);
      window.dispatchEvent(new CustomEvent("minber:add-to-basket", {
        detail: {
          intent: "zakat",
          intentLabel: "زكاة",
          projectId: project?.id,
          fundId: project ? undefined : "zakat-fund",
          slug: project?.slug,
          project: project?.title || "صندوق زكاة فلسطين",
          donationMode: "one-time",
          amount: num(allocation.amount),
          currency: "USD",
          source: "zakat-page",
          receiptType: "zakat",
        },
      }));
    });
  };

  const addBasket = () => {
    if (!valid) {
      setMessage("أكمل المبلغ وتأكيد النية والتوزيع قبل الإضافة إلى السلة.");
      return;
    }
    pushToBasket();
    setMessage("تمت إضافة مسارات الزكاة إلى السلة بصورة مستقلة.");
    setToast(true);
    window.setTimeout(() => setToast(false), 2200);
  };

  const checkout = () => {
    if (!valid) {
      setMessage("أكمل النية والتوزيع قبل المتابعة.");
      return;
    }
    pushToBasket();
    window.location.assign("/checkout");
  };

  const summary = (
    <div className="z-summary" aria-live="polite">
      <span>ملخص تقديري</span>
      <div><small>صافي المال الزكوي</small><strong>{result.net.toFixed(2)} USD</strong></div>
      <div><small>مقدار الزكاة المحدد</small><strong>{selected.toFixed(2)} USD</strong></div>
      <div><small>تم توزيعه</small><strong>{allocated.toFixed(2)} USD</strong></div>
      <div><small>المتبقي</small><strong>{remaining.toFixed(2)} USD</strong></div>
      <p>هذه نتيجة حسابية تقديرية وليست فتوى أو حكمًا شرعيًا.</p>
    </div>
  );

  return (
    <>
      <section id="zakat-calculator" className="z-tool" aria-labelledby="z-tool-title">
        <header>
          <span>حاسبة تقديرية</span>
          <h2 id="z-tool-title">احسب مقدار زكاتك بخطوات واضحة</h2>
          <p>أدخل القيم التي تعرفها، ثم راجع النصاب وحولان الحول والأحكام الخاصة بحالتك مع جهة شرعية معتمدة.</p>
        </header>

        <nav className="z-steps" aria-label="مراحل الحاسبة">
          {["الأصول", "الالتزامات", "النتيجة والنية", "اختيار المسار"].map((label, index) => (
            <button key={label} type="button" aria-pressed={step === index + 1} onClick={() => setStep(index + 1)}>
              <b>{index + 1}</b>{label}
            </button>
          ))}
        </nav>

        <div className="z-grid">
          <div className="z-form">
            <fieldset className={step === 1 ? "active" : ""}>
              <legend>1. الأصول الزكوية</legend>
              <div className="z-inputs">
                {FIELDS.map((field, index) => (
                  <label key={field}>
                    <span>{field}</span>
                    <div><input inputMode="decimal" value={assets[index]} onChange={(event) => setAsset(index, event.target.value)} placeholder="0.00" /><b>USD</b></div>
                  </label>
                ))}
              </div>
              <Button type="button" variant="outline" onClick={() => setStep(2)}>التالي</Button>
            </fieldset>

            <fieldset className={step === 2 ? "active" : ""}>
              <legend>2. الالتزامات والنصاب</legend>
              <label><span>الالتزامات قصيرة الأجل</span><div><input inputMode="decimal" value={liabilities} onChange={(event) => setLiabilities(clean(event.target.value))} /><b>USD</b></div></label>
              <div className="z-nisab">
                <strong>تحقق من قيمة النصاب</strong>
                <p>تتغير القيمة باختلاف سعر الذهب أو الفضة والمرجع الشرعي الذي تعتمد عليه.</p>
                <label><span>أدخل قيمة النصاب التي تعتمدها — اختياري</span><div><input inputMode="decimal" value={nisab} onChange={(event) => setNisab(clean(event.target.value))} /><b>USD</b></div></label>
                {num(nisab) > 0 ? <small>{result.net >= num(nisab) ? "صافي المال أعلى من القيمة المدخلة" : "صافي المال أقل من القيمة المدخلة"} — تحقق من بقية الشروط الشرعية.</small> : null}
              </div>
              <Button type="button" variant="outline" onClick={() => setStep(3)}>التالي</Button>
            </fieldset>

            <section className={step === 3 ? "z-result active" : "z-result"}>
              <span>3. النتيجة التقديرية</span>
              <h3>مقدار الزكاة المحسوب</h3>
              <dl>
                <div><dt>إجمالي الأصول</dt><dd>{result.total.toFixed(2)} USD</dd></div>
                <div><dt>صافي المال الزكوي</dt><dd>{result.net.toFixed(2)} USD</dd></div>
                <div><dt>2.5% تقديريًا</dt><dd>{result.zakat.toFixed(2)} USD</dd></div>
              </dl>
              <label><input type="radio" checked={useEstimate} onChange={() => setUseEstimate(true)} /> استخدام المبلغ المحسوب كاملًا</label>
              <label><input type="radio" checked={!useEstimate} onChange={() => setUseEstimate(false)} /> إدخال مبلغ مختلف</label>
              {!useEstimate ? <label><span>مبلغ الزكاة</span><div><input inputMode="decimal" value={custom} onChange={(event) => setCustom(clean(event.target.value))} /><b>USD</b></div></label> : null}
              <label className="z-intent">
                <input type="checkbox" checked={intent} onChange={(event) => setIntent(event.target.checked)} />
                <span><strong>أنوي هذا المبلغ زكاة</strong><small>تبقى نية الزكاة منفصلة داخل سلة العطاء.</small></span>
              </label>
              {!intent ? <small className="field-error">تأكيد النية مطلوب.</small> : null}
              <Button type="button" variant="outline" onClick={() => setStep(4)}>التالي</Button>
            </section>

            <section className={step === 4 ? "z-allocation active" : "z-allocation"}>
              <header>
                <div><span>4. توزيع الزكاة</span><h3>اختر الصندوق أو المشاريع المؤهلة</h3></div>
                <button type="button" onClick={fullFund}>توجيه كامل المبلغ للصندوق</button>
              </header>
              {allocations.map((allocation, index) => (
                <div className="z-row" key={allocation.id}>
                  <b>{index + 1}</b>
                  <select value={allocation.target} onChange={(event) => updateAllocation(allocation.id, { target: event.target.value })}>
                    {targets.map((target) => <option key={target.id} value={target.id}>{target.title}</option>)}
                  </select>
                  <div><input inputMode="decimal" value={allocation.amount} onChange={(event) => updateAllocation(allocation.id, { amount: clean(event.target.value) })} /><b>USD</b></div>
                  {allocations.length > 1 ? <button type="button" aria-label="إزالة المسار" onClick={() => setAllocations((current) => current.filter((row) => row.id !== allocation.id))}>×</button> : null}
                </div>
              ))}
              <footer>
                <Button type="button" variant="outline" onClick={addRow} disabled={allocations.length >= 3}>قسّم على مشروع آخر</Button>
                <span>المتبقي: <strong>{remaining.toFixed(2)} USD</strong></span>
              </footer>
              {exceeded ? <p className="field-error">مجموع التوزيع يتجاوز مبلغ الزكاة.</p> : null}
            </section>

            <div className="z-privacy">
              <strong>خصوصية الحاسبة</strong>
              <p>تظل تفاصيل الأصول والالتزامات داخل المتصفح ولا تُضاف إلى السلة.</p>
              <button type="button" onClick={reset}>مسح الحاسبة</button>
            </div>
          </div>

          <aside className="z-side">
            {summary}
            <Button fullWidth onClick={checkout}>المتابعة لإخراج الزكاة</Button>
            <Button fullWidth variant="outline" onClick={addBasket}>أضف الزكاة إلى سلة العطاء</Button>
            {message ? <p role="status">{message}</p> : null}
            <small>يمكنك مراجعة المبلغ والمسارات قبل تأكيد العملية.</small>
          </aside>
        </div>
      </section>

      <div className="z-mobile-bar">
        <div><small>مقدار الزكاة التقديري</small><strong>{selected.toFixed(2)} USD</strong></div>
        <button ref={triggerRef} type="button" onClick={() => setSheet(true)}>أكمل زكاتك</button>
      </div>

      {sheet ? (
        <div className="z-layer">
          <button className="z-backdrop" type="button" aria-label="إغلاق" onClick={() => setSheet(false)} />
          <aside ref={sheetRef} className="z-sheet" role="dialog" aria-modal="true" aria-labelledby="z-sheet-title">
            <header><h2 id="z-sheet-title">أكمل زكاتك</h2><button type="button" onClick={() => setSheet(false)} aria-label="إغلاق">×</button></header>
            {summary}
            <Button fullWidth onClick={checkout}>المتابعة لإخراج الزكاة</Button>
            <Button fullWidth variant="outline" onClick={addBasket}>أضف إلى السلة</Button>
            {message ? <p role="status">{message}</p> : null}
          </aside>
        </div>
      ) : null}

      <div className={toast ? "toast is-visible" : "toast"} role="status" aria-live="polite">تمت إضافة الزكاة إلى السلة</div>
    </>
  );
}