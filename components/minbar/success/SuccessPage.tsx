"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { addToCart, type CartFreqKey } from "@/lib/minbar/cart";
import type { MinbarDonationSummary } from "@/lib/minbar/donation";
import { Button } from "@/components/minbar/ds";
import ThanksCertificate from "@/components/minbar/certificates/ThanksCertificate";

/**
 * Donation received — ported from `Minbar/نجاح التبرع.dc.html`.
 *
 * Three things in order: the confirmation and what was given, the documents to
 * keep, and an invitation to make the gift recurring.
 *
 * Two departures from the handoff, both because this one has a server behind it:
 *
 *  - The receipt is the real PDF from `/api/donations/{id}/receipt`, not a
 *    rendered preview. It is the document a donor files, and it must be the
 *    same one the foundation's records hold.
 *
 *  - The handoff's recurring step ends in "confirm", implying a plan starts
 *    there. A recurring plan needs a payment method, which this page has not
 *    collected — so the choice is added to the basket and the donor is taken to
 *    checkout, which is how every other recurring plan on this site begins.
 *    Telling someone a plan is active when nothing was authorised would be a
 *    promise the site cannot keep.
 */

/** The frequencies the upsell offers, in the handoff's order. */
const FREQUENCIES: ReadonlyArray<{ key: Exclude<CartFreqKey, "once">; labelKey: string; ns: "common" }> = [
  { key: "daily", labelKey: "daily", ns: "common" },
  { key: "friday", labelKey: "everyFriday", ns: "common" },
  { key: "monthly", labelKey: "monthly", ns: "common" },
];

/** The quick-pick amounts, in USD, carried from the handoff. */
const SUGGESTED = [50, 100, 200, 500];

const DownloadIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
  </svg>
);

export default function SuccessPage({ donation }: { donation: MinbarDonationSummary }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("system");
  const tCommon = useTranslations("common");
  const tCart = useTranslations("cart");

  const { data: session } = useSession();
  const linked = useRef(false);

  /* A donor who gave as a guest and then signed in still owns this donation.
     Claiming it here attaches it — and every other donation under the same
     anonymous record — to their account, so it appears in their history and
     their receipts are theirs. The route refuses to merge anything already
     claimed by a real account, so this is safe to fire once on arrival. */
  useEffect(() => {
    if (!session?.user?.id || linked.current) return;
    linked.current = true;
    fetch("/api/users/link-guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ donationId: donation.id }),
    }).catch(() => {
      /* Best effort: the donation is recorded either way, and an admin can
         attach it later. Nothing on this page depends on it. */
    });
  }, [session?.user?.id, donation.id]);

  const [certOpen, setCertOpen] = useState(false);
  const [certName, setCertName] = useState(donation.donorName ?? "");

  const [freq, setFreq] = useState<Exclude<CartFreqKey, "once"> | null>(null);
  const [amountMode, setAmountMode] = useState<"same" | "other" | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const projectTitle = donation.titles.length ? donation.titles.join("، ") : tCart("typeProject");
  const amountText = money(locale, donation.amount, donation.currency);

  const chosenAmount =
    amountMode === "same" ? donation.amount : picked ?? (Number(custom) > 0 ? Number(custom) : null);
  const canProceed = Boolean(freq && chosenAmount && chosenAmount > 0);

  const freqLabel = (key: Exclude<CartFreqKey, "once">) =>
    key === "daily" ? tCommon("daily") : key === "friday" ? tCommon("everyFriday") : tCommon("monthly");

  const startPlan = () => {
    if (!freq || !chosenAmount) return;
    /* The plan enters the basket under the same contract as every other item,
       so checkout treats it exactly like a recurring gift started anywhere
       else on the site. */
    addToCart({
      titleKey: donation.titles.length ? undefined : "whereNeedGreatest",
      title: donation.titles[0],
      freqKey: freq,
      amount: chosenAmount,
      currency: donation.currency,
    });
    router.push(miaPath("cart", locale));
  };

  const stepBadge = (active: boolean) =>
    ({
      flex: "0 0 auto",
      width: 22,
      height: 22,
      borderRadius: "50%",
      background: active ? "var(--gold)" : "var(--sand)",
      color: active ? "var(--deep)" : "var(--muted)",
      display: "grid",
      placeItems: "center",
      fontSize: 12,
      fontWeight: 900,
    }) as const;

  const chip = (active: boolean) =>
    ({
      flex: "1 1 0",
      height: 44,
      borderRadius: 8,
      border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`,
      background: active ? "rgba(211,154,39,.14)" : "#fff",
      color: "var(--deep)",
      fontFamily: "inherit",
      fontWeight: 800,
      fontSize: 13.5,
      cursor: "pointer",
    }) as const;

  return (
    <div className="succ-page">
      <section style={{ padding: "52px 0" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 24px", display: "grid", justifyItems: "center", gap: 20, textAlign: "center" }}>
          <span className="succ-mark" aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 74, height: 74, borderRadius: "50%", background: "rgba(31,122,77,.12)", color: "var(--green)" }}>
            <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>

          <h1 className="succ-in succ-in-1" style={{ margin: 0, fontSize: "clamp(26px,3vw,36px)", fontWeight: 900 }}>
            {t("donationSuccess")}
          </h1>
          <p className="succ-in succ-in-2" style={{ margin: 0, fontSize: 16, lineHeight: 1.9, color: "var(--muted)" }}>
            {t("successLead")}
          </p>

          <div className="succ-in succ-in-3" style={{ width: "100%", display: "grid", gap: 10, padding: 22, background: "#fff", border: "1px solid var(--border)", borderRadius: 14, textAlign: "start" }}>
            <SummaryRow label={tCart("typeProject")} value={projectTitle} />
            <SummaryRow label={tCommon("amount")} value={amountText} ltr />
            <SummaryRow label={t("receiptNo")} value={donation.receiptNo} ltr />
          </div>

          <div className="succ-in succ-in-4" style={{ width: "100%", display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <a
              href={`/api/donations/${donation.id}/receipt?locale=${encodeURIComponent(locale)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="succ-link"
              style={{ display: "inline-flex", alignItems: "center", gap: 9, height: 46, padding: "0 20px", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", fontFamily: "inherit", fontWeight: 800, fontSize: 14, color: "var(--deep)" }}
            >
              {DownloadIcon}
              {t("downloadReceipt")}
            </a>

            <button
              type="button"
              onClick={() => setCertOpen((open) => !open)}
              aria-expanded={certOpen}
              className="succ-link2"
              style={{ display: "inline-flex", alignItems: "center", gap: 9, height: 46, padding: "0 20px", borderRadius: 8, border: "1px solid rgba(211,154,39,.55)", background: "rgba(211,154,39,.1)", fontFamily: "inherit", fontWeight: 800, fontSize: 14, color: "var(--deep)", cursor: "pointer" }}
            >
              {DownloadIcon}
              {t("downloadThankYouCert")}
            </button>
          </div>

          {certOpen ? (
            <div style={{ width: "100%", display: "grid", gap: 16, padding: 22, background: "#fff", border: "1px solid var(--border)", borderRadius: 14, textAlign: "start" }}>
              <label style={{ display: "grid", gap: 7 }}>
                <b style={{ fontSize: 13, fontWeight: 800 }}>{t("certNameLabel")}</b>
                <input
                  value={certName}
                  onChange={(event) => setCertName(event.target.value)}
                  placeholder={t("writeYourName")}
                  style={{ height: 46, padding: "0 14px", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", fontFamily: "inherit", fontSize: 14, color: "var(--deep)" }}
                />
              </label>
              {/* The plaque sizes itself from its own width, so the preview and
                  the printed sheet are the same component at two widths. */}
              <div className="succ-cert">
                <ThanksCertificate donorName={certName.trim()} />
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                style={{ justifySelf: "center", display: "inline-flex", alignItems: "center", gap: 9, height: 46, padding: "0 24px", borderRadius: 8, border: 0, background: "var(--gold)", color: "#10212B", fontFamily: "inherit", fontWeight: 900, fontSize: 14, cursor: "pointer" }}
              >
                {DownloadIcon}
                {tCommon("thankYouCertificate")}
              </button>
            </div>
          ) : null}

          {donation.recurring ? (
            <div style={{ position: "relative", width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "20px 24px", background: "var(--deep)", borderRadius: 12, textAlign: "start" }}>
              <span aria-hidden="true" style={{ flex: "0 0 auto", width: 44, height: 44, borderRadius: "50%", background: "rgba(31,122,77,.22)", color: "var(--green)", display: "grid", placeItems: "center" }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <div style={{ display: "grid", gap: 2 }}>
                <b style={{ fontSize: 15.5, fontWeight: 900, color: "#fff" }}>{t("recurringActivated")}</b>
                <span style={{ color: "rgba(255,255,255,.72)", fontSize: 13.5 }}>{t("recurringManageNote")}</span>
              </div>
            </div>
          ) : reviewing ? (
            <div style={{ width: "100%", display: "grid", gap: 16, padding: "22px 24px", background: "#fff", border: "1px solid var(--border)", borderRadius: 12, textAlign: "start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span aria-hidden="true" style={stepBadge(true)}>3</span>
                <b style={{ fontSize: 15, fontWeight: 900 }}>{t("reviewBeforeConfirm")}</b>
              </div>
              <div style={{ display: "grid", gap: 8, padding: 16, background: "var(--sand)", borderRadius: 10 }}>
                <SummaryRow label={t("frequencyLabel")} value={freq ? freqLabel(freq) : ""} />
                <SummaryRow label={tCommon("amount")} value={money(locale, chosenAmount ?? 0, donation.currency)} ltr />
                <SummaryRow label={tCart("typeProject")} value={projectTitle} />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={startPlan} className="succ-confirm" style={{ flex: "1 1 160px", height: 50, border: 0, borderRadius: 8, background: "var(--gold)", color: "var(--deep)", fontWeight: 900, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                  {t("confirmRecurring")}
                </button>
                <button type="button" onClick={() => setReviewing(false)} style={{ flex: "0 0 auto", height: 50, padding: "0 20px", border: "1px solid var(--border)", borderRadius: 8, background: "none", color: "var(--muted)", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  {t("goBack")}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ width: "100%", display: "grid", gap: 18, padding: "22px 24px", background: "#fff", border: "1px solid var(--border)", borderRadius: 12, textAlign: "start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span aria-hidden="true" style={{ flex: "0 0 auto", width: 40, height: 40, borderRadius: "50%", background: "rgba(211,154,39,.14)", color: "var(--gold)", display: "grid", placeItems: "center" }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-3-6.7" />
                    <path d="M21 3v6h-6" />
                  </svg>
                </span>
                <div style={{ display: "grid", gap: 1 }}>
                  <b style={{ fontSize: 15, fontWeight: 900 }}>{t("makeImpactLast")}</b>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("makeImpactLastNote")}</span>
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span aria-hidden="true" style={stepBadge(true)}>1</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "var(--deep)" }}>{t("chooseFrequency")}</span>
                  {freq ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFreq(null);
                        setAmountMode(null);
                        setPicked(null);
                      }}
                      style={{ marginInlineStart: "auto", border: 0, background: "none", color: "var(--gold)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      {t("changeChoice")}
                    </button>
                  ) : null}
                </div>

                {freq ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "fit-content", padding: "8px 16px", borderRadius: 999, background: "rgba(211,154,39,.14)", border: "1px solid rgba(211,154,39,.4)", color: "var(--deep)", fontWeight: 800, fontSize: 13.5 }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    {freqLabel(freq)}
                  </span>
                ) : (
                  <div className="succ-freq" style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
                    {FREQUENCIES.map((option) => (
                      <button key={option.key} type="button" onClick={() => setFreq(option.key)} style={chip(false)}>
                        {freqLabel(option.key)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {freq ? (
                <>
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span aria-hidden="true" style={stepBadge(Boolean(amountMode))}>2</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "var(--deep)" }}>{t("chooseAmountStep")}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => { setAmountMode("same"); setPicked(null); setCustom(""); }} style={chip(amountMode === "same")}>
                        {t("sameAmount")}
                      </button>
                      <button type="button" onClick={() => setAmountMode("other")} style={chip(amountMode === "other")}>
                        {t("otherAmount")}
                      </button>
                    </div>

                    {amountMode === "other" ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {SUGGESTED.map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => { setPicked(value); setCustom(""); }}
                            style={{ ...chip(picked === value), flex: "0 0 auto", padding: "0 16px" }}
                          >
                            {money(locale, value, donation.currency)}
                          </button>
                        ))}
                        <input
                          value={custom}
                          onChange={(event) => { setCustom(event.target.value); setPicked(null); }}
                          inputMode="decimal"
                          placeholder={tCommon("freeAmount")}
                          style={{ height: 44, padding: "0 14px", borderRadius: 8, border: "1px solid var(--border)", fontFamily: "inherit", fontSize: 14, width: 110 }}
                        />
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => setReviewing(true)}
                    disabled={!canProceed}
                    className="succ-confirm"
                    style={{ height: 50, border: 0, borderRadius: 8, background: canProceed ? "var(--gold)" : "var(--sand)", color: canProceed ? "var(--deep)" : "var(--muted)", fontWeight: 900, fontSize: 15, cursor: canProceed ? "pointer" : "not-allowed", fontFamily: "inherit" }}
                  >
                    {t("proceedToReview")}
                  </button>
                </>
              ) : null}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
            <Button variant="primary" href={miaPath("projects", locale)} style={{ whiteSpace: "nowrap" }}>
              {t("browseMoreProjects")}
            </Button>
            <Button variant="light" href={miaPath("home", locale)} style={{ whiteSpace: "nowrap" }}>
              {t("backHomeCta")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryRow({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <span style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      {ltr ? (
        <b dir="ltr" style={{ unicodeBidi: "isolate" }}>{value}</b>
      ) : (
        <b>{value}</b>
      )}
    </span>
  );
}

/**
 * The amount as charged, in the currency it was charged in — never converted
 * into today's selected currency. The receipt says one number, and this page
 * has to say the same one.
 */
function money(locale: string, amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}
