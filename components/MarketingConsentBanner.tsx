"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import {
  readMarketingConsent, setMarketingConsent, MARKETING_CONSENT_EVENT,
  type MarketingConsent,
} from "@/lib/tracking/marketing-consent";

/** Marketing only: a refusal never blocks donation or essential checkout. */
const labels: Record<string, { text: string; yes: string; no: string; settings: string }> = {
  ar: { text: "نستخدم أدوات قياس اختيارية لتحسين تجربة التبرع وتقييم الحملات الإعلانية. لا يؤثر رفضها على التبرع.", yes: "أوافق على القياس", no: "رفض القياس", settings: "إعدادات الخصوصية" },
  tr: { text: "Bağış deneyimini ve kampanyaları geliştirmek için isteğe bağlı analiz araçları kullanıyoruz. Reddetmeniz bağışı etkilemez.", yes: "İzin ver", no: "Reddet", settings: "Gizlilik tercihleri" },
  fr: { text: "Nous utilisons des outils de mesure facultatifs pour améliorer les dons et les campagnes. Le refus ne bloque pas les dons.", yes: "Autoriser", no: "Refuser", settings: "Confidentialité" },
  en: { text: "We use optional analytics to improve donations and advertising campaigns. Declining does not affect donating.", yes: "Allow analytics", no: "Decline analytics", settings: "Privacy choices" },
};

export default function MarketingConsentBanner() {
  const locale = useLocale();
  const [decision, setDecision] = useState<MarketingConsent>("missing");
  const [open, setOpen] = useState(false);
  const copy = labels[locale] ?? labels.en;

  useEffect(() => {
    const refresh = () => setDecision(readMarketingConsent());
    refresh();
    window.addEventListener(MARKETING_CONSENT_EVENT, refresh);
    return () => window.removeEventListener(MARKETING_CONSENT_EVENT, refresh);
  }, []);

  const choose = (value: boolean) => {
    setMarketingConsent(value);
    setOpen(false);
    setDecision(readMarketingConsent());
    // Revoke already-loaded pixel/recorder scripts, not only future emits.
    // Retaining current route and cart is safer than attempting manual teardown
    // of arbitrary third-party scripts injected by GTM.
    window.location.reload();
  };

  const showChoices = decision === "missing" || open;
  return (
    <>
      {showChoices ? (
        <div role="region" aria-label={copy.settings} dir={locale === "ar" ? "rtl" : "ltr"}
          style={{ position: "fixed", bottom: 14, insetInline: 14, zIndex: 9000, maxWidth: 620, marginInline: "auto", padding: 16, background: "#fff", color: "#1f2937", border: "1px solid #e5e7eb", borderRadius: 12, boxShadow: "0 8px 28px #0002", fontFamily: "inherit" }}>
          <p style={{ margin: "0 0 12px", lineHeight: 1.65, fontSize: 14 }}>{copy.text}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => choose(true)} style={{ background: "#8c1934", color: "#fff", padding: "10px 14px", borderRadius: 8, border: 0 }}>{copy.yes}</button>
            <button type="button" onClick={() => choose(false)} style={{ background: "#f3f4f6", color: "#111827", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db" }}>{copy.no}</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label={copy.settings}
          style={{ position: "fixed", bottom: 8, insetInlineEnd: 8, zIndex: 8999, borderRadius: 8, background: "#fff", color: "#374151", border: "1px solid #d1d5db", fontSize: 11, padding: "5px 8px", opacity: 0.8 }}>
          {copy.settings}
        </button>
      )}
    </>
  );
}
