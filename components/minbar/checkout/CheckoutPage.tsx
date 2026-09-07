"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { useMinbarCart } from "@/hooks/useMinbarCart";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import type { MinbarCartItem } from "@/lib/minbar/cart";
import { formatIban, type MinbarBank } from "@/lib/minbar/banks";
import {
  chargeWithStripe,
  createDonation,
  initiateBankPayment,
  markDonationFailed,
  submitGatewayForm,
  type CheckoutMethod,
} from "@/lib/minbar/checkout";
import { clearCart } from "@/lib/minbar/cart";
import { fetchGlobalSettings } from "@/lib/global-settings-client";
import { useReferralCode } from "@/hooks/useReferralCode";
import { resolveGateway, type MainGateway } from "@/lib/payment-gateway";
import type { MinbarProject } from "@/lib/minbar/projects";
import CardPreview from "./CardPreview";

/**
 * Donor details and payment — ported from `Minbar/بيانات الدفع.dc.html`.
 *
 * Three payment paths: card, PayPal, and bank transfer.
 *
 * `[BACKEND-INTEGRATION]`, from the handoff and honoured here:
 *  - the cart is client-controlled and is never the basis for a charge. This
 *    form posts identifiers and the donor's details; the server re-resolves each
 *    project, recomputes the amount in its currency, and creates the order.
 *  - card details are not read or stored by this component beyond what the
 *    preview shows. The fields are the design's; wiring them to the gateway's
 *    hosted fields is the payment integration's job, and a real card number must
 *    never reach this origin.
 *  - PayPal opens a checkout session created by the backend. No donation exists
 *    until PayPal confirms.
 *  - bank transfer creates nothing at all: the donor copies an IBAN, transfers
 *    outside the site, and uploads a receipt. A finance officer moves it to
 *    Confirmed (`DONATION_LOGIC_SPEC §3`), and only then is a certificate issued.
 *
 * `[AUTH-INTEGRATION]`: the Google and Facebook buttons sign the donor in and
 * pre-fill their name and email.
 */

type PaymentMethod = "card" | "paypal" | "bank";

export interface CheckoutPageProps {
  projects: MinbarProject[];
  banks: readonly MinbarBank[];
  donor: { firstName: string; lastName: string; email: string; phone: string } | null;
}

export default function CheckoutPage({ projects, banks, donor }: CheckoutPageProps) {
  const locale = useLocale();
  const t = useTranslations("cart");
  const tCommon = useTranslations("common");
  const tProjects = useTranslations("projects");
  const tValidation = useTranslations("validation");
  const tSystem = useTranslations("system");
  const { format } = useMinbarMoney();
  const { items, hydrated } = useMinbarCart();

  const [method, setMethod] = useState<PaymentMethod>("card");
  const [firstName, setFirstName] = useState(donor?.firstName ?? "");
  const [lastName, setLastName] = useState(donor?.lastName ?? "");
  const [email, setEmail] = useState(donor?.email ?? "");
  const [phone, setPhone] = useState(donor?.phone ?? "");
  const [bankId, setBankId] = useState(banks[0]?.id ?? "");
  const [copied, setCopied] = useState<string | null>(null);

  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardName, setCardName] = useState("");
  const [cvcFocused, setCvcFocused] = useState(false);

  const router = useRouter();
  const { data: session } = useSession();
  const { currency } = useMinbarMoney();
  /* Whoever sent this donor here, if a campaign link set the cookie. Read at
     submit time so the attribution is the one in force when they gave. */
  const readReferralCode = useReferralCode();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Which rail this order runs on is the server's decision, not the browser's:
     it follows the currency and the admin switches. Fetched once so the card
     step knows whether the bank collects the card on its own page. */
  const [gatewayConfig, setGatewayConfig] = useState<{
    /* PayFor is never a *main* gateway an admin nominates — it is resolved per
       order, from the currency and the admin switch. */
    mainGateway: MainGateway;
    payforEnabled: boolean;
    albarakaUseOOS: boolean;
  } | null>(null);

  useEffect(() => {
    let live = true;
    fetchGlobalSettings()
      .then((settings) => {
        if (!live || !settings) return;
        setGatewayConfig({
          mainGateway: settings.mainGateway,
          payforEnabled: settings.payforEnabled,
          albarakaUseOOS: settings.albarakaUseOOS,
        });
      })
      .catch(() => {
        /* The order can still be created; the rail resolves to the default. */
      });
    return () => {
      live = false;
    };
  }, []);

  const titleBySlug = useMemo(() => new Map(projects.map((p) => [p.slug, p.title])), [projects]);

  const resolveTitle = (item: MinbarCartItem): string => {
    if (item.projectId) {
      const fromCms = titleBySlug.get(item.projectId);
      if (fromCms) return fromCms;
    }
    if (item.titleKey) {
      if (t.has(item.titleKey)) return t(item.titleKey);
      if (tCommon.has(item.titleKey)) return tCommon(item.titleKey);
    }
    return item.title ?? "";
  };

  const total = items.reduce((sum, item) => sum + item.amount, 0);
  /* One type for the whole order; the cart page does not let the two mix. */
  const orderTypeForCart = items.some((item) => item.freqKey !== "once") ? "MONTHLY" : "ONE_TIME";
  const selectedBank = banks.find((b) => b.id === bankId) ?? banks[0];

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      // Clipboard access can be denied; the value is on screen and selectable.
    }
  };

  /**
   * Create the donation, then hand the donor to whichever rail the server's
   * settings select.
   *
   * Bank transfer is the exception and creates nothing to pay: the donor copies
   * an IBAN, transfers outside the site and uploads a receipt, and a finance
   * officer confirms it (`DONATION_LOGIC_SPEC §3`). The order is still recorded
   * so there is something for them to match the money against, and the donor
   * lands on the "awaiting confirmation" screen rather than on success.
   */
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || !items.length) return;

    const signedIn = Boolean(session?.user);
    if (!signedIn && (!firstName.trim() || !email.trim())) {
      setError(tValidation("required"));
      return;
    }

    setSubmitting(true);
    setError(null);

    const methodForServer: CheckoutMethod =
      method === "bank" ? "BANK_TRANSFER" : method === "paypal" ? "PAYPAL" : "CARD";

    let donationId: string | null = null;
    try {
      const donation = await createDonation({
        items,
        projects,
        currency,
        locale,
        method: methodForServer,
        referralCode: readReferralCode(),
        guest: signedIn
          ? null
          : { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phone: phone.trim() },
      });
      donationId = donation.id;

      if (method === "bank") {
        /* Nothing is charged. The basket is cleared because the order exists,
           and the donor is told it is awaiting a finance officer's match. */
        clearCart();
        router.push(miaPath("paymentPending", locale));
        return;
      }

      const gateway = resolveGateway({
        mainGateway: gatewayConfig?.mainGateway ?? "STRIPE",
        payforEnabled: gatewayConfig?.payforEnabled ?? true,
        currency,
        donationType: orderTypeForCart,
      });

      if (gateway === "STRIPE") {
        await chargeWithStripe(donation.id, locale);
        clearCart();
        router.push(`${miaPath("donationSuccess", locale)}/${donation.id}`);
        return;
      }

      /* A bank rail. Albaraka signs the card into its request MAC, so its card
         values go to the server; PayFor leaves them out of the hash, so the
         browser appends them and the number never reaches this origin. */
      const [expiryMonth = "", expiryYear = ""] = cardExpiry.split("/");
      const sendCardToServer = gateway === "ALBARAKA" && !gatewayConfig?.albarakaUseOOS;

      const form = await initiateBankPayment(
        donation.id,
        locale,
        gateway,
        sendCardToServer
          ? {
              number: cardNumber.replace(/\D/g, ""),
              expiry: cardExpiry,
              cvv: cardCvc,
              holder: cardName,
            }
          : undefined
      );

      const browserFields: Record<string, string> =
        gateway === "PAYFOR"
          ? {
              Pan: cardNumber.replace(/\D/g, ""),
              Expiry: `${expiryMonth}${expiryYear}`,
              Cvv2: cardCvc,
              CardHolderName: cardName,
            }
          : {};

      /* The basket is cleared before the redirect: the order now exists on the
         server, and a donor returning from the bank must not find it still
         sitting in their basket ready to be paid twice. */
      clearCart();
      submitGatewayForm(form, browserFields);
    } catch (cause) {
      if (donationId) await markDonationFailed(donationId, String(cause));
      setError(tSystem("techErrorLead"));
      setSubmitting(false);
    }
  };

  const steps = [
    { n: 1, label: t("stepCart"), href: miaPath("cart", locale), current: false },
    { n: 2, label: t("stepDetails"), href: miaPath("checkout", locale), current: true },
    { n: 3, label: t("stepConfirm"), href: miaPath("checkout", locale), current: false },
  ];

  const methods: ReadonlyArray<{ id: PaymentMethod; label: string; icon: React.ReactElement }> = [
    {
      id: "card",
      label: t("creditCard"),
      icon: (
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5.5" width="18" height="13" rx="2" />
          <path d="M3 9.5h18" />
        </svg>
      ),
    },
    {
      id: "paypal",
      // A brand name — Latin in every language.
      label: "PayPal",
      icon: (
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 20 8 4h6.5a3.5 3.5 0 0 1 0 7H9" />
          <path d="M8.5 15h4.8a3.5 3.5 0 0 0 0-7" />
        </svg>
      ),
    },
    {
      id: "bank",
      label: t("bankTransfer"),
      icon: (
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 21h18M5 21V10M10 21V10M14 21V10M19 21V10M12 3 21 8H3Z" />
        </svg>
      ),
    },
  ];

  const fieldStyle: CSSProperties = {
    height: 48,
    border: "1.5px solid var(--border)",
    borderRadius: 10,
    padding: "0 14px",
    fontSize: 15,
    fontWeight: 700,
    color: "var(--deep)",
    background: "var(--ivory)",
    fontFamily: "inherit",
    transition: "border-color .18s ease, background .18s ease",
    width: "100%",
    boxSizing: "border-box",
  };

  const cardFieldStyle: CSSProperties = { ...fieldStyle, height: 46, background: "#fff", border: "1px solid var(--border)", fontSize: 14 };

  return (
    <div style={{ position: "relative" }}>
      <section style={{ padding: "0 0 18px", paddingTop: 44 }}>
        <div id="pay-steps" style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap", minWidth: 0 }}>
          {steps.map((step, i) => (
            <span key={step.n} style={{ display: "contents" }}>
              <Link
                href={step.href}
                className="cart-step"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: `1px solid ${step.current ? "var(--gold)" : "var(--border)"}`,
                  background: step.current ? "#fff" : "transparent",
                  color: step.current ? "var(--deep)" : "var(--muted)",
                  fontSize: 13,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: "50%", background: step.current ? "var(--gold)" : "var(--border)", color: step.current ? "#10212B" : "var(--muted)", fontSize: 12, fontWeight: 900 }}>
                  {step.n}
                </span>
                {step.label}
              </Link>
              {i < steps.length - 1 ? <span aria-hidden="true" style={{ flex: "1 1 24px", maxWidth: 60, height: 1, background: "var(--border)" }} /> : null}
            </span>
          ))}
        </div>
      </section>

      <section style={{ padding: "0 0 64px" }}>
        <div id="pay-grid" style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,.85fr)", gap: 40, alignItems: "start" }}>
          <form style={{ display: "grid", gap: 22 }} onSubmit={onSubmit} noValidate>
            {/* ── Donor details ──────────────────────────────────────────── */}
            <div className="pay-card" style={cardBox}>
              <h2 style={headingStyle}>
                <span aria-hidden="true" style={headingIcon}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="3.6" />
                    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
                  </svg>
                </span>
                {t("donorDetails")}
              </h2>

              {!donor ? (
                <>
                  <div id="pay-social" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
                    <button type="button" onClick={() => signIn("google")} className="pay-social-btn" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, height: 48, border: "1.5px solid var(--border)", borderRadius: 10, background: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 800, color: "var(--deep)", cursor: "pointer", transition: "border-color .18s ease, box-shadow .18s ease, transform .18s ease" }}>
                      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                        <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81Z" />
                        <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z" />
                        <path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.28a12 12 0 0 0 0 10.76l4.01-3.1Z" />
                        <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44A11.98 11.98 0 0 0 1.28 6.62l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z" />
                      </svg>
                      Google
                    </button>
                    <button type="button" onClick={() => signIn("facebook")} className="pay-social-btn pay-social-btn--fb" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, height: 48, border: 0, borderRadius: 10, background: "#1877F2", fontFamily: "inherit", fontSize: 14, fontWeight: 800, color: "#fff", cursor: "pointer", transition: "filter .18s ease, box-shadow .18s ease, transform .18s ease" }}>
                      <svg viewBox="0 0 24 24" width="19" height="19" fill="#fff" aria-hidden="true">
                        <path d="M13.5 21v-7.6h2.6l.4-3h-3v-1.9c0-.87.24-1.46 1.5-1.46h1.6V4.3c-.28-.04-1.23-.12-2.34-.12-2.32 0-3.9 1.4-3.9 4V10.4H7.4v3h2.9V21h3.2Z" />
                      </svg>
                      Facebook
                    </button>
                  </div>
                  <span style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "var(--muted)", lineHeight: 1.7 }}>{t("socialAutofillNote")}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 11.5, fontWeight: 700 }}>
                    <span aria-hidden="true" style={{ flex: "1 1 auto", height: 1, background: "var(--border)" }} />
                    {t("orFillManually")}
                    <span aria-hidden="true" style={{ flex: "1 1 auto", height: 1, background: "var(--border)" }} />
                  </div>
                </>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }}>
                <label style={{ display: "grid", gap: 7 }}>
                  <span style={labelStyle}>{t("firstName")}</span>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" className="pay-field" style={fieldStyle} />
                </label>
                <label style={{ display: "grid", gap: 7 }}>
                  <span style={labelStyle}>{t("lastName")}</span>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" className="pay-field" style={fieldStyle} />
                </label>
                <label style={{ display: "grid", gap: 7 }}>
                  <span style={{ ...labelStyle, display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {t("email")} <b aria-hidden="true" style={{ color: "var(--red)" }}>*</b>
                  </span>
                  {/* Latin-script data: isolated so bidi cannot reorder it. */}
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" dir="ltr" className="pay-field" style={{ ...fieldStyle, unicodeBidi: "isolate" }} />
                </label>
                <label style={{ display: "grid", gap: 7 }}>
                  <span style={{ ...labelStyle, display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {t("phone")} <b aria-hidden="true" style={{ color: "var(--red)" }}>*</b>
                  </span>
                  <input type="tel" required dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" className="pay-field" style={{ ...fieldStyle, unicodeBidi: "isolate" }} />
                </label>
              </div>

              {donor ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "fit-content", padding: "6px 12px", borderRadius: 999, background: "rgba(31,122,77,.1)", color: "var(--green)", fontSize: 12.5, fontWeight: 800 }}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {t("socialAutofillNote")}
                </span>
              ) : null}

              <span style={{ display: "flex", alignItems: "flex-start", gap: 7, width: "100%", fontSize: 12, fontWeight: 800, color: "var(--red)", textAlign: "start", lineHeight: 1.75, minWidth: 0 }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flex: "0 0 auto", marginTop: 3 }}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8h.01M12 11v5" />
                </svg>
                <span style={{ minWidth: 0, flex: "1 1 auto" }}>{t("dataAccuracyNote")}</span>
              </span>
            </div>

            {/* ── Payment method ─────────────────────────────────────────── */}
            <div className="pay-card" style={cardBox}>
              <h2 style={headingStyle}>
                <span aria-hidden="true" style={headingIcon}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5.5" width="18" height="13" rx="2" />
                    <path d="M3 9.5h18" />
                  </svg>
                </span>
                {t("paymentMethod")}
              </h2>

              <div id="pay-methods" style={{ display: "flex", gap: 10 }}>
                {methods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    data-pick={method === m.id ? "1" : ""}
                    onClick={() => setMethod(m.id)}
                    className="pay-method"
                    style={{ flex: "1 1 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 46, padding: "0 10px", border: "1px solid var(--border)", background: "#fff", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", transition: "all .18s ease" }}
                  >
                    <span aria-hidden="true" style={{ flex: "0 0 auto", color: "var(--muted)" }}>
                      {m.icon}
                    </span>
                    <span style={{ fontWeight: 800, fontSize: 13.5, whiteSpace: "nowrap" }}>{m.label}</span>
                  </button>
                ))}
              </div>

              {method === "bank" && selectedBank ? (
                <div style={{ display: "grid", gap: 12, padding: 16, background: "var(--sand)", border: "1px solid rgba(211,154,39,.4)", borderRadius: 10 }}>
                  <b style={{ fontSize: 13.5 }}>{t("bankHeading")}</b>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)" }}>{t("bank")}</span>
                    <select value={bankId} onChange={(e) => setBankId(e.target.value)} style={{ height: 42, border: "1px solid var(--border)", borderRadius: 8, background: "#fff", padding: "0 12px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                      {banks.map((bank) => (
                        <option key={bank.id} value={bank.id}>
                          {bank.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {selectedBank.logo ? (
                      <img src={selectedBank.logo} alt="" style={{ width: 44, height: 44, flex: "0 0 auto", objectFit: "contain", background: "#fff", border: "1px solid var(--border)", borderRadius: 8 }} />
                    ) : null}
                    <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                      <b style={{ fontSize: 13.5 }}>{selectedBank.name}</b>
                      <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        {t("acceptedCurrencies")}: {selectedBank.currencies.map((c) => c.code).join(" · ")}
                      </span>
                    </span>
                  </div>

                  {[
                    { key: `${selectedBank.id}:holder`, label: t("accountName"), value: selectedBank.holder, latin: false },
                    { key: `${selectedBank.id}:swift`, label: "SWIFT / BIC", value: selectedBank.swift, latin: true },
                    ...selectedBank.currencies.map((c) => ({
                      key: `${selectedBank.id}:iban:${c.code}`,
                      label: `IBAN · ${c.code}`,
                      value: formatIban(c.iban),
                      latin: true,
                    })),
                  ].map((row) => (
                    <span key={row.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", background: "#fff", border: "1px solid var(--border)", borderRadius: 8 }}>
                      <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)" }}>{row.label}</span>
                        {/* An identifier is the one place break-all is allowed. */}
                        <b dir={row.latin ? "ltr" : undefined} style={{ fontSize: 13.5, unicodeBidi: row.latin ? "isolate" : undefined, wordBreak: "break-all" }}>
                          {row.value}
                        </b>
                      </span>
                      <button
                        type="button"
                        onClick={() => copy(row.key, row.value.replace(/\s/g, ""))}
                        aria-label={tCommon("share")}
                        className="pay-copy-btn"
                        style={{ flex: "0 0 auto", display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 8, border: "1px solid var(--border)", background: "#fff", color: copied === row.key ? "var(--green)" : "var(--muted)", cursor: "pointer", transition: "all .18s ease" }}
                      >
                        {copied === row.key ? (
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="9" y="9" width="11" height="11" rx="2" />
                            <path d="M5 15V5a2 2 0 0 1 2-2h8" />
                          </svg>
                        )}
                      </button>
                    </span>
                  ))}

                  <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>{t("bankTransferNote")}</span>
                </div>
              ) : null}

              {method === "card" ? (
                <div style={{ display: "grid", gap: 14 }}>
                  <CardPreview number={cardNumber} name={cardName || `${firstName} ${lastName}`.trim()} expiry={cardExpiry} cvc={cardCvc} flipped={cvcFocused} />
                  <div id="card-fields" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }}>
                    <label style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{t("cardNumber")}</span>
                      <input
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 19))}
                        inputMode="numeric"
                        autoComplete="cc-number"
                        dir="ltr"
                        aria-label={t("cardNumber")}
                        placeholder="•••• •••• •••• ••••"
                        style={{ ...cardFieldStyle, unicodeBidi: "isolate" }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{t("cardExpiry")}</span>
                      <input
                        value={cardExpiry}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
                          setCardExpiry(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
                        }}
                        inputMode="numeric"
                        autoComplete="cc-exp"
                        dir="ltr"
                        aria-label={t("cardExpiry")}
                        placeholder="MM/YY"
                        style={{ ...cardFieldStyle, unicodeBidi: "isolate" }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>CVC</span>
                      <input
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                        onFocus={() => setCvcFocused(true)}
                        onBlur={() => setCvcFocused(false)}
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        dir="ltr"
                        aria-label="CVC"
                        placeholder="•••"
                        style={{ ...cardFieldStyle, unicodeBidi: "isolate" }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{t("cardHolder")}</span>
                      <input value={cardName} onChange={(e) => setCardName(e.target.value)} autoComplete="cc-name" aria-label={t("cardHolder")} style={cardFieldStyle} />
                    </label>
                  </div>
                </div>
              ) : null}

              {method === "paypal" ? (
                <div style={{ display: "grid", gap: 12, justifyItems: "center", padding: "16px 14px", background: "var(--sand)", border: "1px solid var(--border)", borderRadius: 12 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--deep)", textAlign: "center", lineHeight: 1.8 }}>{t("paypalRedirect")}</span>
                </div>
              ) : null}
            </div>

            {method === "paypal" ? (
              <button
                type="submit"
                disabled={submitting || !items.length}
                className="pay-paypal"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", height: 52, border: 0, borderRadius: 8, background: "#FFC439", color: "#10212B", fontFamily: "inherit", fontWeight: 900, fontSize: 15, cursor: "pointer", boxShadow: "0 6px 16px rgba(255,196,57,.35)", boxSizing: "border-box", transition: "filter .18s ease, transform .18s ease" }}
              >
                <b style={{ fontStyle: "italic", fontWeight: 900, color: "#253B80", letterSpacing: "-.02em" }}>PayPal</b>
                <span aria-hidden="true" style={{ width: 1, height: 20, background: "rgba(16,33,43,.2)" }} />
                {t("ctaComplete")}
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting || !items.length}
                className="mia-card-cta"
                style={{ width: "100%", height: 52, border: 0, borderRadius: 8, background: "var(--red)", color: "#fff", fontFamily: "inherit", fontWeight: 900, fontSize: 16, cursor: "pointer", boxShadow: "var(--shadow-cta)", transition: "filter .18s ease" }}
              >
                {method === "bank" ? t("ctaBankSent") : t("ctaComplete")}
              </button>
            )}

            {error ? (
              <p role="alert" style={{ margin: 0, textAlign: "center", fontSize: 13, fontWeight: 800, color: "var(--red)" }}>
                {error}
              </p>
            ) : null}

            <p style={{ margin: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 7, textAlign: "start", fontSize: 12.5, lineHeight: 1.75, color: "var(--muted)" }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "0 0 auto", marginTop: 3 }}>
                <rect x="5" y="10.5" width="14" height="9" rx="1.5" />
                <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
              </svg>
              {t("secureNote")}
            </p>
          </form>

          {/* ── Summary ──────────────────────────────────────────────────── */}
          <div id="pay-summary" className="pay-card" style={{ display: "grid", gap: 16, padding: 26, background: "var(--sand)", border: "1px solid rgba(211,154,39,.35)", borderRadius: 14, position: "sticky", top: 92 }}>
            <h2 style={{ ...headingStyle, fontSize: 18 }}>
              <span aria-hidden="true" style={{ ...headingIcon, width: 30, height: 30, background: "#fff" }}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m4 8 2 11h12l2-11H4Z" />
                  <path d="m9 8 3-4 3 4M9 12v3M15 12v3" />
                </svg>
              </span>
              {t("donationSummary")}
            </h2>

            {!hydrated ? (
              <div style={{ minHeight: 90 }} />
            ) : items.length ? (
              <>
                <div style={{ display: "grid", gap: 10, paddingBottom: 14, borderBottom: "1px solid rgba(211,154,39,.3)" }}>
                  {items.map((item, index) => (
                    <span key={index} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14 }}>
                      <span style={{ color: "var(--muted)", minWidth: 0 }}>{resolveTitle(item)}</span>
                      <b dir="ltr" style={{ flex: "0 0 auto", unicodeBidi: "isolate" }}>
                        {format(item.amount)}
                      </b>
                    </span>
                  ))}
                </div>
                <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 16, fontWeight: 900 }}>
                  {t("total")}
                  <b dir="ltr" style={{ fontSize: 22, unicodeBidi: "isolate" }}>
                    {format(total)}
                  </b>
                </span>
              </>
            ) : (
              <p style={{ margin: 0, padding: "10px 0", color: "var(--muted)", fontSize: 14, lineHeight: 1.8 }}>
                {t("emptyCart")}{" "}
                <Link href={miaPath("projects", locale)} style={{ color: "var(--gold)", fontWeight: 800 }}>
                  {tProjects("allProjects")}
                </Link>
              </p>
            )}

            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", paddingTop: 4, borderTop: "1px solid rgba(211,154,39,.3)" }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 21s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 7.5 3c0 5.3-7.5 10-7.5 10Z" />
              </svg>
              {t("receiptNote")}
            </span>

            <Link href={miaPath("cart", locale)} className="cart-add-another" style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>
              {t("backToCart")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

const cardBox: CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 26,
  background: "#fff",
  border: "1px solid var(--border)",
  borderRadius: 14,
};

const headingStyle: CSSProperties = {
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 20,
  fontWeight: 900,
};

const headingIcon: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 32,
  height: 32,
  borderRadius: 9,
  background: "var(--sand)",
  color: "var(--gold)",
};

const labelStyle: CSSProperties = { fontSize: 12.5, fontWeight: 800, color: "var(--deep)" };
