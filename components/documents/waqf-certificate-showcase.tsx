"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { visualAssets } from "@/config/visual-assets";
import { OfficialAssetPlaceholder } from "@/components/brand/official-asset-placeholder";
import { OfficialLetterShowcase } from "./official-letter-showcase";
import { FramedCertificatePreview } from "./framed-certificate-preview";

type TabId = "certificate" | "letter" | "framed";
const tabs: Array<{ id: TabId; label: string }> = [{ id: "certificate", label: "الشهادة" }, { id: "letter", label: "خطاب الاعتماد" }, { id: "framed", label: "شكلها بعد الإصدار" }];
const focusable = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function WaqfCertificateShowcase() {
  const [active, setActive] = useState<TabId>("certificate");
  const [expanded, setExpanded] = useState(false);
  const baseId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const expandTriggerRef = useRef<HTMLButtonElement>(null);
  const asset = visualAssets.find((item) => item.id === "waqf-certificate");

  useEffect(() => {
    if (!expanded || !dialogRef.current) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const items = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusable));
    requestAnimationFrame(() => items()[0]?.focus());
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setExpanded(false); return; }
      if (event.key !== "Tab") return;
      const available = items();
      if (!available.length) return;
      const first = available[0], last = available[available.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = old; document.removeEventListener("keydown", key); expandTriggerRef.current?.focus(); };
  }, [expanded]);

  const certificate = asset ? <section className="document-showcase">{asset.path && asset.status !== "required" ? <Image src={asset.path} alt={asset.alt} width={1400} height={1000} sizes="(max-width: 767px) 92vw, 46vw" /> : <OfficialAssetPlaceholder asset={asset} />}<dl><div><dt>اسم صاحب الوقف</dt><dd>يظهر بعد استكمال البيانات</dd></div><div><dt>نوع الوقف</dt><dd>يُربط باختيار المتبرع</dd></div><div><dt>المشروع</dt><dd>يُربط بالمشروع المعتمد</dd></div><div><dt>حالة الإصدار</dt><dd>معاينة — ستصدر بعد الدفع والمراجعة</dd></div></dl></section> : null;

  return <section className="waqf-certificate-showcase" aria-labelledby={`${baseId}-title`}>
    <header><span>وثيقة أثر وليست إيصال دفع</span><h2 id={`${baseId}-title`}>شهادة توثّق وقفك وتحفظ اسمه</h2><p>تظل جميع النماذج معاينات حتى اكتمال البيانات والدفع والمراجعة وإصدار الوثيقة الرسمية.</p></header>
    <div className="document-tabs" role="tablist" aria-label="معاينات وثائق الوقف">{tabs.map((tab, index) => <button key={tab.id} id={`${baseId}-${tab.id}-tab`} role="tab" type="button" aria-selected={active === tab.id} aria-controls={`${baseId}-${tab.id}-panel`} tabIndex={active === tab.id ? 0 : -1} onClick={() => setActive(tab.id)} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const delta = event.key === "ArrowLeft" ? 1 : -1; const next = tabs[(index + delta + tabs.length) % tabs.length]; setActive(next.id); document.getElementById(`${baseId}-${next.id}-tab`)?.focus(); }}>{tab.label}</button>)}</div>
    {tabs.map((tab) => <div key={tab.id} id={`${baseId}-${tab.id}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab.id}-tab`} hidden={active !== tab.id} tabIndex={0}>{tab.id === "certificate" ? <><button ref={expandTriggerRef} className="certificate-expand-button" type="button" onClick={() => setExpanded(true)}>تكبير المعاينة</button>{certificate}</> : null}{tab.id === "letter" ? <OfficialLetterShowcase /> : null}{tab.id === "framed" ? <FramedCertificatePreview /> : null}</div>)}
    {expanded ? <div className="certificate-dialog-layer"><button className="certificate-dialog-backdrop" type="button" aria-label="إغلاق المعاينة" onClick={() => setExpanded(false)} /><div ref={dialogRef} className="certificate-dialog" role="dialog" aria-modal="true" aria-labelledby={`${baseId}-dialog-title`}><header><h2 id={`${baseId}-dialog-title`}>معاينة شهادة الوقف</h2><button type="button" onClick={() => setExpanded(false)} aria-label="إغلاق">×</button></header><div>{certificate}</div><p>معاينة غير نهائية — لا تمثل وثيقة قانونية أو شهادة صادرة.</p></div></div> : null}
  </section>;
}
