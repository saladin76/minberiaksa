"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { visualAssets } from "@/config/visual-assets";
import { OfficialAssetPlaceholder } from "@/components/brand/official-asset-placeholder";
import { OfficialLetterShowcase } from "./official-letter-showcase";
import { FramedCertificatePreview } from "./framed-certificate-preview";

type TabId = "certificate" | "letter" | "framed";
const tabs: Array<{ id: TabId; label: string }> = [
  { id: "certificate", label: "الشهادة" },
  { id: "letter", label: "خطاب الاعتماد" },
  { id: "framed", label: "شكلها بعد الإصدار" },
];

export function WaqfCertificateShowcase() {
  const [active, setActive] = useState<TabId>("certificate");
  const baseId = useId();
  const asset = visualAssets.find((item) => item.id === "waqf-certificate");

  return (
    <section className="waqf-certificate-showcase" aria-labelledby={`${baseId}-title`}>
      <header>
        <span>وثيقة أثر وليست إيصال دفع</span>
        <h2 id={`${baseId}-title`}>شهادة توثّق وقفك وتحفظ اسمه</h2>
        <p>تظل جميع النماذج معاينات حتى اكتمال البيانات والدفع والمراجعة وإصدار الوثيقة الرسمية.</p>
      </header>
      <div className="document-tabs" role="tablist" aria-label="معاينات وثائق الوقف">
        {tabs.map((tab) => (
          <button key={tab.id} id={`${baseId}-${tab.id}-tab`} role="tab" type="button" aria-selected={active === tab.id} aria-controls={`${baseId}-${tab.id}-panel`} tabIndex={active === tab.id ? 0 : -1} onClick={() => setActive(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} id={`${baseId}-${tab.id}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab.id}-tab`} hidden={active !== tab.id} tabIndex={0}>
          {tab.id === "certificate" && asset ? (
            <section className="document-showcase">
              {asset.path && asset.status !== "required" ? (
                <Image src={asset.path} alt={asset.alt} width={1400} height={1000} sizes="(max-width: 767px) 92vw, 46vw" />
              ) : (
                <OfficialAssetPlaceholder asset={asset} />
              )}
              <dl>
                <div><dt>اسم صاحب الوقف</dt><dd>يظهر بعد استكمال البيانات</dd></div>
                <div><dt>نوع الوقف</dt><dd>يُربط باختيار المتبرع</dd></div>
                <div><dt>المشروع</dt><dd>يُربط بالمشروع المعتمد</dd></div>
                <div><dt>حالة الإصدار</dt><dd>معاينة — ستصدر بعد الدفع والمراجعة</dd></div>
              </dl>
            </section>
          ) : null}
          {tab.id === "letter" ? <OfficialLetterShowcase /> : null}
          {tab.id === "framed" ? <FramedCertificatePreview /> : null}
        </div>
      ))}
    </section>
  );
}
