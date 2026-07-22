"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Project = { id: string; slug: string; title: string };
type WaqfType = "share" | "open" | "gift" | "project";

const typeLabels: Record<WaqfType, string> = {
  share: "سهم وقفي",
  open: "مساهمة مفتوحة",
  gift: "إهداء وقف",
  project: "تمويل مشروع أو مرحلة",
};

const focusable = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const clean = (value: string) => value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");

export function WaqfBuilder({ projects }: { projects: Project[] }) {
  const [type, setType] = useState<WaqfType>("open");
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [scope, setScope] = useState("المشروع كاملًا");
  const [amount, setAmount] = useState(250);
  const [custom, setCustom] = useState("");
  const [ownerMode, setOwnerMode] = useState("عني");
  const [owner, setOwner] = useState("");
  const [sender, setSender] = useState("");
  const [occasion, setOccasion] = useState("وقف عام");
  const [dedication, setDedication] = useState("");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [step, setStep] = useState(1);
  const sheetRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const selectedProject = projects.find((project) => project.id === projectId);
  const selectedAmount = custom ? Number(custom) || 0 : amount;
  const available = type !== "share";
  const canSubmit = available && selectedAmount > 0 && owner.trim().length > 0 && (type !== "project" || Boolean(selectedProject));

  const summary = useMemo(() => ({
    type: typeLabels[type],
    project: selectedProject?.title || (type === "project" ? "اختر مشروعًا وقفيًا" : "وقف عام"),
    amount: available ? `${selectedAmount.toFixed(2)} USD` : "غير متاح حاليًا",
    owner: owner || "اسم صاحب الوقف",
  }), [type, selectedProject, selectedAmount, owner, available]);

  useEffect(() => {
    if (!sheet || !sheetRef.current) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = sheetRef.current;
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(focusable));
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
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [sheet]);

  const changeType = (nextType: WaqfType) => {
    setType(nextType);
    setMessage("");
    setCustom("");
    setStep(nextType === "share" ? 2 : 2);
  };

  const basketPayload = () => ({
    intent: "waqf",
    intentLabel: "وقف",
    donationMode: type === "gift" ? "gift" : "one-time",
    waqfType: type,
    projectId: selectedProject?.id,
    slug: selectedProject?.slug,
    project: selectedProject?.title || typeLabels[type],
    amount: selectedAmount,
    currency: "USD",
    ownerName: owner,
    dedication,
    source: "waqf-page",
    certificateType: "waqf",
    giftData: type === "gift" ? { recipient: owner, occasion, message: dedication, sender } : undefined,
    dedicationData: { target: ownerMode, ownerName: owner, dedication },
  });

  const addBasket = () => {
    if (!available) {
      setMessage("قيمة السهم الوقفي لم تُعتمد بعد، لذلك لا يمكن إضافته إلى السلة حاليًا.");
      return;
    }
    if (!canSubmit) {
      setMessage("أدخل اسم صاحب الوقف وحدد مبلغًا ومشروعًا صالحًا.");
      return;
    }
    window.dispatchEvent(new CustomEvent("minber:add-to-basket", { detail: basketPayload() }));
    setMessage("تمت إضافة الوقف إلى سلة العطاء.");
    setToast(true);
    window.setTimeout(() => setToast(false), 2200);
  };

  const checkout = () => {
    if (!available) {
      setMessage("السهم الوقفي غير متاح حتى اعتماد قيمته رسميًا.");
      return;
    }
    if (!canSubmit) {
      setMessage("أكمل بيانات الوقف قبل المتابعة.");
      return;
    }
    window.dispatchEvent(new CustomEvent("minber:add-to-basket", { detail: basketPayload() }));
    window.location.assign("/checkout");
  };

  const certificate = (
    <div className="w-certificate" aria-live="polite">
      <span className="w-certificate-line" />
      <small>بيانات شهادة الوقف</small>
      <p>مؤسسة منبر الأقصى الدولية</p>
      <h3>{owner || "اسم صاحب الوقف"}</h3>
      <dl>
        <div><dt>نوع المساهمة</dt><dd>{summary.type}</dd></div>
        <div><dt>المشروع</dt><dd>{summary.project}</dd></div>
        <div><dt>الإهداء</dt><dd>{dedication || "تُضاف نية الوقف هنا"}</dd></div>
      </dl>
      <p>تصدر الشهادة النهائية بعد اكتمال العملية واعتماد بياناتها.</p>
    </div>
  );

  const builder = (
    <div className="w-builder-body">
      <nav className="w-builder-steps" aria-label="مراحل إنشاء الوقف">
        {["نوع الوقف", "المشروع أو المبلغ", "صاحب الوقف", "بيانات الشهادة", "الملخص"].map((label, index) => (
          <button key={label} type="button" aria-pressed={step === index + 1} onClick={() => setStep(index + 1)}>
            <b>{index + 1}</b>{label}
          </button>
        ))}
      </nav>

      <div className={step === 1 ? "w-step active" : "w-step"}>
        <fieldset>
          <legend>اختر طريقة مساهمتك الوقفية</legend>
          <div className="w-type-grid">
            {(Object.keys(typeLabels) as WaqfType[]).map((item) => (
              <button key={item} type="button" className={type === item ? "is-selected" : ""} aria-pressed={type === item} onClick={() => changeType(item)}>
                <span>{typeLabels[item]}</span>
                <small>{item === "share" ? "غير متاح حتى اعتماد القيمة" : item === "open" ? "مبلغ مرن" : item === "gift" ? "عن شخص عزيز" : "مشروع أو مرحلة"}</small>
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className={step === 2 ? "w-step active" : "w-step"}>
        {type === "share" ? (
          <section className="w-price-required">
            <span>السهم الوقفي</span>
            <h3>قيمة السهم لم تُعتمد بعد</h3>
            <p>لن نعرض سعرًا أو نحسب إجماليًا قبل اعتماد قيمة السهم والمشروع المرتبط به.</p>
            <Button href="/waqf" variant="outline">استكشف طرق الوقف المتاحة</Button>
          </section>
        ) : (
          <fieldset>
            <legend>{type === "project" ? "اختر المشروع ونطاق التمويل" : "اختر مبلغ المساهمة"}</legend>
            {type === "project" ? (
              <>
                <label><span>المشروع الوقفي</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label>
                <div className="w-scope">
                  <button type="button" className={scope === "المشروع كاملًا" ? "is-selected" : ""} onClick={() => setScope("المشروع كاملًا")}>المشروع كاملًا</button>
                  <button type="button" className={scope === "مرحلة من المشروع" ? "is-selected" : ""} onClick={() => setScope("مرحلة من المشروع")}>مرحلة من المشروع</button>
                </div>
                <p className="w-project-note">تظهر تفاصيل نطاق التنفيذ والتكلفة داخل صفحة المشروع بعد اعتمادها.</p>
              </>
            ) : null}
            <div className="w-amounts">
              {[100, 250, 500, 1000].map((value) => (
                <button key={value} type="button" aria-pressed={!custom && amount === value} className={!custom && amount === value ? "is-selected" : ""} onClick={() => { setAmount(value); setCustom(""); }}>{value} USD</button>
              ))}
            </div>
            <label><span>مبلغ آخر</span><input inputMode="decimal" value={custom} onChange={(event) => setCustom(clean(event.target.value))} /></label>
            {selectedAmount <= 0 ? <small className="field-error">أدخل مبلغًا صحيحًا أكبر من صفر.</small> : null}
          </fieldset>
        )}
        {available ? <Button type="button" variant="outline" onClick={() => setStep(3)}>التالي</Button> : null}
      </div>

      <div className={step === 3 ? "w-step active" : "w-step"}>
        <fieldset>
          <legend>صاحب الوقف والإهداء</legend>
          <div className="w-owner-modes">
            {["عني", "عن شخص آخر", "عن الوالدين", "عن متوفى", "وقف عائلي"].map((item) => (
              <button key={item} type="button" className={ownerMode === item ? "is-selected" : ""} aria-pressed={ownerMode === item} onClick={() => setOwnerMode(item)}>{item}</button>
            ))}
          </div>
          <label><span>اسم صاحب الوقف</span><input value={owner} onChange={(event) => setOwner(event.target.value)} required /></label>
          {type === "gift" ? (
            <>
              <label><span>اسم المرسل — اختياري</span><input value={sender} onChange={(event) => setSender(event.target.value)} /></label>
              <label><span>المناسبة أو النية</span><select value={occasion} onChange={(event) => setOccasion(event.target.value)}><option>وقف عام</option><option>عن الوالدين</option><option>عن متوفى</option><option>مناسبة خاصة</option></select></label>
            </>
          ) : null}
          <label><span>الإهداء أو النية — اختياري</span><textarea value={dedication} maxLength={180} onChange={(event) => setDedication(event.target.value.slice(0, 180))} /><small>{dedication.length}/180</small></label>
          {!owner.trim() ? <small className="field-error">اسم صاحب الوقف مطلوب.</small> : null}
        </fieldset>
        <Button type="button" variant="outline" onClick={() => setStep(4)}>مراجعة بيانات الشهادة</Button>
      </div>

      <div className={step === 4 ? "w-step active" : "w-step"}>
        {certificate}
        <Button type="button" variant="outline" onClick={() => setStep(5)}>عرض الملخص</Button>
      </div>

      <div className={step === 5 ? "w-step active" : "w-step"}>
        <div className="w-summary" aria-live="polite">
          <span>ملخص الوقف</span>
          <dl>
            <div><dt>النوع</dt><dd>{summary.type}</dd></div>
            <div><dt>المشروع</dt><dd>{summary.project}</dd></div>
            <div><dt>صاحب الوقف</dt><dd>{summary.owner}</dd></div>
            <div><dt>المبلغ</dt><dd>{summary.amount}</dd></div>
            {type === "project" ? <div><dt>النطاق</dt><dd>{scope}</dd></div> : null}
          </dl>
          <p>الوقف تبرع خيري ولا يترتب عليه عائد مالي للمتبرع.</p>
        </div>
        <Button fullWidth onClick={checkout} disabled={!canSubmit}>المتابعة لإنشاء الوقف</Button>
        <Button fullWidth variant="outline" onClick={addBasket} disabled={!canSubmit}>أضف الوقف إلى سلة العطاء</Button>
      </div>

      {message ? <p className="w-message" role="status">{message}</p> : null}
    </div>
  );

  return (
    <>
      <section id="waqf-builder" className="w-builder" aria-labelledby="w-builder-title">
        <header><span>إنشاء وقف</span><h2 id="w-builder-title">اختر طريقة مساهمتك الوقفية</h2><p>حدد نوع الوقف والمشروع وصاحب الوقف، ثم راجع البيانات قبل المتابعة.</p></header>
        {builder}
      </section>

      <div className="w-mobile-bar">
        <div><small>أنشئ وقفًا</small><strong>{typeLabels[type]} · {selectedProject?.title || "وقف عام"}</strong></div>
        <button ref={triggerRef} type="button" onClick={() => setSheet(true)}>ابدأ</button>
      </div>

      {sheet ? (
        <div className="w-layer">
          <button className="w-backdrop" type="button" aria-label="إغلاق" onClick={() => setSheet(false)} />
          <aside ref={sheetRef} className="w-sheet" role="dialog" aria-modal="true" aria-labelledby="w-sheet-title">
            <header><h2 id="w-sheet-title">إنشاء وقف</h2><button type="button" onClick={() => setSheet(false)} aria-label="إغلاق">×</button></header>
            {builder}
          </aside>
        </div>
      ) : null}

      <div className={toast ? "toast is-visible" : "toast"} role="status" aria-live="polite">تمت إضافة الوقف إلى السلة</div>
    </>
  );
}