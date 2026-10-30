"use client";
import { useTranslations } from "next-intl";
import type { AlbarakaCheckoutMode } from "@/lib/donations/albaraka-checkout-mode";

/** Adds one compact field without moving or replacing any checkout inputs. */
export function AlbarakaVerificationChoice({ value, onChange, disabled, invalid = false }: { value: AlbarakaCheckoutMode | null; onChange: (value: AlbarakaCheckoutMode) => void; disabled?: boolean; invalid?: boolean }) {
  const t = useTranslations("cart");
  return <fieldset disabled={disabled} className="ab-verification" data-choice={value || ""} data-invalid={invalid || undefined} aria-invalid={invalid || undefined} aria-describedby={!value ? "albaraka-verification-hint" : undefined}>
    <legend>{t("verificationChoice")}</legend>
    <div className="ab-verification-options">
      {(["2D", "3D"] as const).map(mode => <label key={mode} className={`ab-verification-option${mode === "2D" ? " ab-verification-direct" : ""}`}>
        <input id={`albaraka-${mode.toLowerCase()}`} type="radio" name="albaraka-verification" value={mode} required checked={value === mode} onChange={() => onChange(mode)} />
        <span className="ab-verification-copy"><span className="ab-verification-title"><strong>{t(mode === "2D" ? "verificationDirect" : "verificationSecure")}</strong><bdi>{mode}</bdi></span><small>{t(mode === "2D" ? "verificationDirectHelp" : "verificationSecureHelp")}</small></span>
      </label>)}
    </div>
    {!value ? <small id="albaraka-verification-hint" className="ab-verification-hint">{t("verificationRequired")}</small> : null}
    <style>{`
      @property --ab-checkout-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
      @keyframes ab-checkout-orbit { to { --ab-checkout-angle: 360deg; } }
      .ab-verification { min-width:0; border:0; padding:0; margin:0; }
      .ab-verification legend { font:inherit; font-size:13px; font-weight:800; color:var(--deep); margin-bottom:8px; padding:0; }
      .ab-verification-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
      .ab-verification-option { display:flex; gap:7px; align-items:flex-start; min-width:0; min-height:58px; padding:8px; border:1.5px solid var(--border); border-radius:8px; background:var(--white,#fff); }
      .ab-verification-option input { width:16px; height:16px; margin:3px 0 0; flex-shrink:0; accent-color:var(--deep); }
      .ab-verification-copy { flex:1; min-width:0; }
      .ab-verification-title { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:3px; color:var(--deep); font-size:12.5px; line-height:1.6; }
      .ab-verification-title strong { font-weight:800; }
      .ab-verification-title bdi { font-size:10.5px; font-weight:800; padding:0 3px; border-radius:4px; background:var(--sand); }
      .ab-verification-copy small { display:block; font-size:11.5px; line-height:1.65; color:var(--muted); margin-top:2px; }
      .ab-verification-hint { display:block; margin-top:7px; font-size:11.5px; color:var(--muted); }
      .ab-verification-option:has(input:checked) { border-color:var(--deep); }
      .ab-verification[data-invalid="true"] legend,.ab-verification[data-invalid="true"] .ab-verification-hint { color:var(--red); font-weight:800; }
      .ab-verification[data-invalid="true"] .ab-verification-option { border-color:var(--red); }
      .ab-verification-direct,.ab-verification-direct:has(input:checked) { border-color:transparent; background:linear-gradient(var(--sand),var(--sand)) padding-box,conic-gradient(from var(--ab-checkout-angle,0deg),var(--gold) 0deg 265deg,var(--deep) 310deg,var(--gold) 355deg 360deg) border-box; box-shadow:0 0 10px rgba(211,154,39,.16); animation:ab-checkout-orbit 5s linear infinite; }
      .ab-verification[data-choice="3D"] .ab-verification-direct { animation:none; border-color:var(--border); background:var(--white,#fff); box-shadow:none; }
      .ab-verification:disabled { opacity:.65; }
      @media (prefers-reduced-motion:reduce) { .ab-verification-direct,.ab-verification-direct:has(input:checked) { animation:none; } }
    `}</style>
  </fieldset>;
}
