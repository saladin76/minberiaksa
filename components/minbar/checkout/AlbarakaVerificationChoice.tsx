"use client";
import { useTranslations } from "next-intl";
import type { AlbarakaCheckoutMode } from "@/lib/donations/albaraka-checkout-mode";

/** One-time Albaraka payments are direct unless the donor opts into 3D. */
export function AlbarakaVerificationChoice({ value, onChange, disabled, fixed = false }: { value: AlbarakaCheckoutMode | null; onChange: (value: AlbarakaCheckoutMode) => void; disabled?: boolean; invalid?: boolean; fixed?: boolean }) {
  const t = useTranslations("cart");
  if (fixed) return <fieldset disabled className="ab-verification ab-verification-fixed">
    <legend className="sr-only">{t("paymentMethod")}</legend>
    <label><input id={`albaraka-${value?.toLowerCase()}`} type="radio" name="albaraka-verification" value={value || ""} checked readOnly /><span>{t(value === "3D" ? "verificationSecure" : "verificationDirect")} <bdi>{value}</bdi></span></label>
    <style>{`.ab-verification-fixed{margin:0;padding:0;border:0;font-size:12px;color:var(--muted)}.ab-verification-fixed label{display:flex;align-items:center;gap:7px}.ab-verification-fixed input{width:15px;height:15px;margin:0;accent-color:var(--deep)}`}</style>
  </fieldset>;
  return <fieldset disabled={disabled} className="ab-verification" data-choice={value || "2D"}>
    <legend className="sr-only">{t("verificationChoice")}</legend>
    <label className="ab-verification-option">
      <input id="albaraka-3d" type="checkbox" name="albaraka-verification" checked={value === "3D"} onChange={event => onChange(event.target.checked ? "3D" : "2D")} aria-describedby="albaraka-verification-help" />
      <span><strong>{t("verificationSecureOptIn")}</strong><small id="albaraka-verification-help">{t("verificationOptionalHelp")}</small></span>
    </label>
    <style>{`
      .ab-verification{min-width:0;border:0;padding:0;margin:0}
      .ab-verification-option{display:flex;gap:9px;align-items:flex-start;cursor:pointer;padding:9px 11px;border:1px solid var(--border);border-radius:9px;background:var(--white,#fff)}
      .ab-verification-option input{width:16px;height:16px;margin:3px 0 0;flex-shrink:0;accent-color:var(--deep)}
      .ab-verification-option strong{display:block;font-size:12.5px;font-weight:700;color:var(--deep)}
      .ab-verification-option small{display:block;font-size:11.5px;line-height:1.7;color:var(--muted);margin-top:2px}
      .ab-verification-option:has(input:checked){border-color:var(--deep);background:var(--sand)}
      .ab-verification-option:focus-within{outline:2px solid var(--gold);outline-offset:2px}
      .ab-verification:disabled{opacity:.65}
    `}</style>
  </fieldset>;
}
