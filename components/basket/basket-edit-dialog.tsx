"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { projects } from "@/data/projects";
import { recurringFunds } from "@/data/recurring";
import type { BasketItem } from "@/types/basket";
import { recurringEstimates } from "./basket-utils";

const focusable = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function BasketEditDialog({ item, onClose, onSave }: { item: BasketItem; onClose: () => void; onSave: (updates: Partial<Omit<BasketItem, "id">>) => void }) {
  const root = useRef<HTMLDivElement | null>(null);
  const close = useRef<HTMLButtonElement | null>(null);
  const [amount, setAmount] = useState(String(item.amount));
  const [target, setTarget] = useState(item.projectId ? `project:${item.projectId}` : item.fundId ? `fund:${item.fundId}` : "");
  const [frequency, setFrequency] = useState(item.frequency ?? "friday");
  const [start, setStart] = useState(item.startPreference ?? "after-confirmation");
  const [owner, setOwner] = useState(item.ownerName ?? "");
  const [dedication, setDedication] = useState(item.dedication ?? "");
  const [recipient, setRecipient] = useState(item.giftRecipient ?? "");
  const [email, setEmail] = useState(item.giftEmail ?? "");
  const [occasion, setOccasion] = useState(item.giftOccasion ?? "هدية عامة");
  const [message, setMessage] = useState(item.giftMessage ?? "");
  const [sender, setSender] = useState(item.giftSender ?? "");
  const [error, setError] = useState("");
  const recurring = item.intent === "recurring" || item.donationMode === "recurring";
  const eligible = useMemo(() => projects.filter((project) => item.intent === "zakat"
    ? project.donationTypes.includes("zakat")
    : item.intent === "waqf"
      ? project.donationTypes.includes("waqf")
      : recurring
        ? project.donationTypes.includes("recurring")
        : false), [item.intent, recurring]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => close.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !root.current) return;
      const elements = Array.from(root.current.querySelectorAll<HTMLElement>(focusable));
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", onKeyDown);
      requestAnimationFrame(() => previous?.focus());
    };
  }, [onClose]);

  const save = () => {
    const normalized = amount.trim().replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(normalized)) {
      setError("أدخل مبلغًا صحيحًا.");
      return;
    }
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) {
      setError("أدخل مبلغًا صحيحًا.");
      return;
    }
    if (item.minimumAmount && value < item.minimumAmount) {
      setError("المبلغ أقل من الحد المتاح.");
      return;
    }
    if (item.intent === "waqf" && !owner.trim()) {
      setError("أدخل اسم صاحب الوقف.");
      return;
    }
    if (item.donationMode === "gift" && !recipient.trim()) {
      setError("أدخل اسم المهدى إليه.");
      return;
    }
    if ((item.intent === "zakat" || item.intent === "waqf" || recurring) && !target) {
      setError("اختر المشروع.");
      return;
    }

    const updates: Partial<Omit<BasketItem, "id">> = { amount: value };
    if (target) {
      const [kind, id] = target.split(":");
      if (kind === "project") {
        const project = projects.find((entry) => entry.id === id);
        if (project) Object.assign(updates, { projectId: project.id, fundId: undefined, slug: project.slug, projectTitle: project.title.ar, region: project.region });
      } else {
        const fund = recurringFunds.find((entry) => entry.id === id);
        if (fund) Object.assign(updates, { fundId: fund.id, projectId: undefined, slug: undefined, projectTitle: fund.title, region: fund.region });
      }
    }
    if (recurring) {
      const estimates = recurringEstimates(frequency, value);
      Object.assign(updates, { frequency, startPreference: start, estimatedMonthly: estimates.monthly, estimatedAnnual: estimates.annual });
    }
    if (item.intent === "waqf") Object.assign(updates, { ownerName: owner.trim(), dedication: dedication.trim() });
    if (item.donationMode === "gift") Object.assign(updates, { giftRecipient: recipient.trim(), giftEmail: email.trim(), giftOccasion: occasion, giftMessage: message.trim(), giftSender: sender.trim() });
    onSave(updates);
  };

  return (
    <div className="basket-modal-layer">
      <button className="basket-modal-backdrop" type="button" aria-label="إغلاق نافذة التعديل" onClick={onClose} />
      <div ref={root} className="basket-edit-dialog basket-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="basket-edit-title">
        <header><h2 id="basket-edit-title">تعديل التبرع</h2><button ref={close} type="button" aria-label="إغلاق" onClick={onClose}>×</button></header>
        <div className="basket-edit-form">
          <p>{item.projectTitle}</p>
          <label><span>المبلغ · {item.currency}</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          {(item.intent === "zakat" || item.intent === "waqf" || recurring) ? (
            <label><span>المشروع</span><select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">اختر المشروع</option>{recurring ? <optgroup label="خيارات عامة">{recurringFunds.map((fund) => <option key={fund.id} value={`fund:${fund.id}`}>{fund.title}</option>)}</optgroup> : null}<optgroup label="المشاريع المتاحة">{eligible.map((project) => <option key={project.id} value={`project:${project.id}`}>{project.title.ar}</option>)}</optgroup></select></label>
          ) : null}
          {item.intent === "zakat" ? <p>سيبقى هذا التبرع مسجلًا كزكاة.</p> : null}
          {item.intent === "waqf" ? <><label><span>صاحب الوقف</span><input value={owner} onChange={(event) => setOwner(event.target.value)} /></label><label><span>رسالة الإهداء</span><textarea maxLength={180} value={dedication} onChange={(event) => setDedication(event.target.value)} /></label></> : null}
          {recurring ? <><fieldset><legend>التكرار</legend>{[["daily", "يومي"], ["friday", "كل جمعة"], ["monthly", "شهري"]].map(([value, label]) => <button key={value} type="button" aria-pressed={frequency === value} onClick={() => setFrequency(value)}>{label}</button>)}</fieldset><fieldset><legend>موعد البدء</legend><button type="button" aria-pressed={start === "after-confirmation"} onClick={() => setStart("after-confirmation")}>بعد التأكيد</button><button type="button" aria-pressed={start === "next-month"} onClick={() => setStart("next-month")}>بداية الشهر القادم</button></fieldset></> : null}
          {item.donationMode === "gift" ? <><label><span>المهدى إليه</span><input value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label><label><span>البريد الإلكتروني</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>المناسبة</span><input value={occasion} onChange={(event) => setOccasion(event.target.value)} /></label><label><span>الرسالة</span><textarea maxLength={180} value={message} onChange={(event) => setMessage(event.target.value)} /></label><label><span>اسم المرسل</span><input value={sender} onChange={(event) => setSender(event.target.value)} /></label></> : null}
          {error ? <p role="alert">{error}</p> : null}
        </div>
        <div className="basket-modal-actions"><Button type="button" variant="outline" onClick={onClose}>إلغاء</Button><Button type="button" onClick={save}>حفظ التغييرات</Button></div>
      </div>
    </div>
  );
}
