"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { addToCart } from "@/lib/minbar/cart";
import { formatIban, type MinbarBank } from "@/lib/minbar/banks";

/**
 * Bank accounts — ported from `Minbar/الحسابات البنكية.dc.html`.
 *
 * The transfer path in full (`DONATION_LOGIC_SPEC §3`):
 *   Awaiting receipt → Receipt uploaded → Under review → Confirmed | Rejected
 *
 * This page is the first step only. The donor copies an IBAN, transfers from
 * their own bank, and records the intended donation so the finance team can
 * match it. Nothing is charged here, and no certificate exists until a finance
 * officer confirms the money actually arrived.
 *
 * `[DASHBOARD-INTEGRATION]`: accounts differ per language and region and are
 * managed from the dashboard — see `lib/minbar/banks.ts` for that seam.
 *
 * Every identifier (IBAN, SWIFT, account number) renders `dir="ltr"` and
 * isolated. These are also the one place the design permits `word-break:
 * break-all`, because an IBAN must stay readable rather than overflow.
 */
export default function BankAccountsPage({ banks }: { banks: readonly MinbarBank[] }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("cart");
  const tCommon = useTranslations("common");

  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      // Clipboard may be blocked; the value is on screen and selectable.
    }
  };

  /** Records the intended transfer so the finance team can match it. */
  const onConfirm = () => {
    const value = Number(amount.replace(/[^0-9.]/g, ""));
    if (!(value > 0)) return;
    addToCart({ titleKey: "generalBankTransfer", typeKey: "project", freqKey: "once", amount: value, currency: "USD" });
    router.push(miaPath("cart", locale));
  };

  const copyButton = (key: string, value: string) => (
    <button
      type="button"
      onClick={() => copy(key, value)}
      aria-label={tCommon("copy")}
      title={tCommon("copy")}
      className="bk-copy"
      style={{
        flex: "0 0 auto",
        display: "grid",
        placeItems: "center",
        width: 34,
        height: 34,
        borderRadius: 8,
        border: `1px solid ${copied === key ? "var(--green)" : "var(--border)"}`,
        background: copied === key ? "rgba(31,122,77,.08)" : "#fff",
        color: copied === key ? "var(--green)" : "var(--muted)",
        cursor: "pointer",
        transition: "all .18s ease",
      }}
    >
      {copied === key ? (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h8" />
        </svg>
      )}
    </button>
  );

  return (
    <div style={{ position: "relative" }}>
      <section style={{ padding: "48px 0 26px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 24px", display: "grid", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: "clamp(26px,3vw,36px)", fontWeight: 900 }}>{t("bankPageTitle")}</h1>
          <div style={{ width: 90, height: 2, background: "var(--gold)" }} />
          <p style={{ margin: 0, maxWidth: "68ch", fontSize: 16, lineHeight: 1.9, color: "var(--muted)" }}>{t("bankPageLead")}</p>
        </div>
      </section>

      {/* Record the intended transfer */}
      <section style={{ padding: "0 0 30px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 24px" }}>
          <div id="bk-direct" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "20px 22px", background: "#fff", border: "1px solid rgba(211,154,39,.4)", borderRadius: 14, boxShadow: "0 14px 34px rgba(16,33,43,.06)" }}>
            <span aria-hidden="true" style={{ flex: "0 0 auto", display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: 10, background: "var(--sand)", color: "var(--gold)" }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m4 8 2 11h12l2-11H4Z" />
                <path d="m9 8 3-4 3 4M9 12v3M15 12v3" />
              </svg>
            </span>
            <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <b style={{ fontSize: 15 }}>{t("bankDirectTitle")}</b>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("bankDirectLead")}</span>
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginInlineStart: "auto", flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "stretch", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                <span style={{ display: "grid", placeItems: "center", width: 34, background: "var(--sand)", color: "var(--muted)", fontSize: 13, fontWeight: 900 }}>$</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  placeholder={tCommon("amount")}
                  aria-label={tCommon("amount")}
                  style={{ width: 110, height: 42, border: 0, padding: "0 10px", fontFamily: "inherit", fontWeight: 800, fontSize: 14, color: "var(--deep)" }}
                />
              </span>
              <button
                type="button"
                onClick={onConfirm}
                className="mia-card-cta"
                style={{ height: 42, padding: "0 20px", border: 0, borderRadius: 10, background: "var(--red)", color: "#fff", fontFamily: "inherit", fontWeight: 900, fontSize: 14, cursor: "pointer", transition: "filter .18s ease" }}
              >
                {tCommon("confirmDonation")}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: "0 0 60px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 24px", display: "grid", gap: 20 }}>
          {banks.length ? (
            banks.map((bank) => (
              <div key={bank.id} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 14px 34px rgba(16,33,43,.06)" }}>
                <div className="bk-head" style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 22px", borderBottom: "1px solid var(--border)", background: "var(--sand)", flexWrap: "wrap" }}>
                  {bank.logo ? (
                    <img src={bank.logo} alt="" style={{ width: 54, height: 54, flex: "0 0 auto", objectFit: "contain", background: "#fff", border: "1px solid var(--border)", borderRadius: 10 }} />
                  ) : (
                    <span aria-hidden="true" style={{ width: 54, height: 54, flex: "0 0 auto", display: "grid", placeItems: "center", background: "#fff", border: "1px solid var(--border)", borderRadius: 10, color: "var(--gold)" }}>
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 21h18M5 21V10M10 21V10M14 21V10M19 21V10M12 3 21 8H3Z" />
                      </svg>
                    </span>
                  )}
                  <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
                    <b style={{ fontSize: 17 }}>{bank.name}</b>
                    {bank.branch ? <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{bank.branch}</span> : null}
                  </span>
                  <span style={{ marginInlineStart: "auto", display: "grid", gap: 3, textAlign: "end" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: ".05em" }}>SWIFT / BIC</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <b dir="ltr" style={{ fontSize: 13.5, unicodeBidi: "isolate" }}>
                        {bank.swift}
                      </b>
                      {copyButton(`${bank.id}:swift`, bank.swift)}
                    </span>
                  </span>
                </div>

                <div style={{ display: "grid", gap: 12, padding: 22 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", background: "var(--ivory)", border: "1px solid var(--border)", borderRadius: 8 }}>
                    <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)" }}>{t("accountName")}</span>
                      <b style={{ fontSize: 13.5 }}>{bank.holder}</b>
                    </span>
                    {copyButton(`${bank.id}:holder`, bank.holder)}
                  </div>

                  {bank.currencies.map((account) => (
                    <div key={account.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", background: "var(--ivory)", border: "1px solid var(--border)", borderRadius: 8 }}>
                      <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 800, color: "var(--muted)" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 999, background: "rgba(211,154,39,.14)", color: "#8a5d16", fontWeight: 900 }}>{account.code}</span>
                          IBAN
                        </span>
                        {/* An identifier: the one permitted use of break-all. */}
                        <b dir="ltr" style={{ fontSize: 14.5, unicodeBidi: "isolate", letterSpacing: ".02em", wordBreak: "break-all" }}>
                          {formatIban(account.iban)}
                        </b>
                        {account.accountNo ? (
                          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                            {t("bankAccountNoLabel")}:{" "}
                            <b dir="ltr" style={{ unicodeBidi: "isolate" }}>
                              {account.accountNo}
                            </b>
                          </span>
                        ) : null}
                      </span>
                      {copyButton(`${bank.id}:iban:${account.code}`, account.iban)}
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p style={{ margin: 0, padding: 30, textAlign: "center", color: "var(--muted)", background: "#fff", border: "1px solid var(--border)", borderRadius: 14 }}>
              {t("noBanksPublished")}
            </p>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", background: "var(--sand)", border: "1px solid rgba(211,154,39,.4)", borderRadius: 12, fontSize: 13.5, color: "var(--muted)" }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "0 0 auto", color: "var(--gold)" }}>
              <path d="M12 21s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 7.5 3c0 5.3-7.5 10-7.5 10Z" />
            </svg>
            {t("bankAfterTransferNote")}
          </div>
        </div>
      </section>
    </div>
  );
}
