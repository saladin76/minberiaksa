"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/minbar/ds";
import { miaPath } from "@/lib/minbar/routes";

/**
 * The waqf, recurring-giving and donor-account sections of the homepage.
 * Ported from `Minbar/الصفحة الرئيسية.dc.html`.
 */

/* ── Waqf ───────────────────────────────────────────────────────────────────
 * The eight areas of continuing benefit are approved interface copy translated
 * in full, not dashboard content — they name the endowment's own programmes. */
export function WaqfSection() {
  const locale = useLocale();
  const t = useTranslations("homepage");

  const areas = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => t(`waqfArea${n}`));

  return (
    <section id="waqf" style={{ position: "relative", zIndex: 1, background: "linear-gradient(to left, rgba(247,242,234,.34), rgba(247,242,234,.72))", borderTop: "1px solid var(--border)", padding: "56px 0", overflow: "hidden" }}>
      {/* A minaret drawn in gold line, faded toward the start edge. */}
      <svg
        viewBox="0 0 200 260"
        aria-hidden="true"
        style={{
          position: "absolute",
          insetInlineEnd: -34,
          bottom: -40,
          width: 190,
          height: "auto",
          opacity: 0.1,
          pointerEvents: "none",
          WebkitMaskImage: "linear-gradient(to left, rgba(0,0,0,.95), transparent 78%)",
          maskImage: "linear-gradient(to left, rgba(0,0,0,.95), transparent 78%)",
        }}
      >
        <g fill="none" stroke="#D39A27" strokeWidth="2">
          <path d="M100 24c34 0 62 26 62 60v152H38V84c0-34 28-60 62-60Z" />
          <path d="M100 62c20 0 36 15 36 34v140H64V96c0-19 16-34 36-34Z" />
          <path d="M100 100c11 0 20 9 20 20v116H80V120c0-11 9-20 20-20Z" />
        </g>
      </svg>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
        <div id="waqf-grid" style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(280px,.9fr) minmax(320px,1.1fr)", gap: 40, alignItems: "start" }}>
          <div style={{ position: "relative", display: "grid", gap: 16, justifyItems: "start", alignContent: "start" }}>
            <h2 style={{ margin: 0, fontSize: "clamp(24px,2.5vw,34px)", lineHeight: 1.25, fontWeight: 900, letterSpacing: "-.01em" }}>{t("waqfTitle")}</h2>
            <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.85, fontSize: 15, maxWidth: "58ch" }}>{t("waqfLead")}</p>
            <Button variant="gold" size="lg" href={miaPath("waqf", locale)} style={{ whiteSpace: "nowrap" }}>
              {t("waqfCtaQuds")}
            </Button>
          </div>
          <div id="waqf-areas" style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, alignContent: "start" }}>
            {areas.map((area) => (
              <span
                key={area}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minHeight: 50,
                  padding: "10px 14px",
                  background: "#fff",
                  border: "1px solid rgba(211,154,39,.32)",
                  borderInlineStart: "3px solid var(--gold)",
                  borderRadius: 8,
                  boxShadow: "0 6px 16px rgba(16,33,43,.05)",
                  fontSize: 13.5,
                  fontWeight: 800,
                  color: "var(--deep)",
                  lineHeight: 1.5,
                }}
              >
                <span style={{ flex: "0 0 auto", width: 5, height: 5, background: "var(--gold)", transform: "rotate(45deg)" }} />
                {area}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Recurring giving ───────────────────────────────────────────────────────── */
export function RecurringSection() {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const tCommon = useTranslations("common");

  return (
    <section id="monthly" style={{ position: "relative", zIndex: 1, background: "linear-gradient(to left, rgba(19,44,56,.05), rgba(247,242,234,.66))", borderTop: "1px solid var(--border)", padding: "56px 0", overflow: "hidden" }}>
      <div
        aria-hidden="true"
        data-aqsa-pattern=""
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url('/minbar/assets/patterns/aqsa-white-pattern.webp')",
          backgroundRepeat: "repeat",
          backgroundSize: "520px 520px",
          opacity: 0.05,
          pointerEvents: "none",
        }}
      />
      <span aria-hidden="true" style={{ position: "absolute", insetInlineStart: 0, top: 0, bottom: 0, width: 4, background: "linear-gradient(180deg, var(--navy), rgba(19,44,56,.2))", pointerEvents: "none" }} />
      <div id="monthly-grid" style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 32, alignItems: "center" }}>
        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(24px,2.5vw,34px)", lineHeight: 1.25, fontWeight: 900, letterSpacing: "-.01em" }}>{t("recurringTitle")}</h2>
          <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.85, fontSize: 16, maxWidth: "58ch" }}>{t("recurringLead")}</p>
        </div>
        <Link
          href={miaPath("recurring", locale)}
          className="mia-recurring-cta"
          style={{ display: "inline-flex", alignItems: "center", gap: 12, flex: "0 0 auto", height: 54, padding: "0 26px", background: "var(--red)", color: "#fff", fontWeight: 800, fontSize: 16.5, whiteSpace: "nowrap", borderRadius: 8 }}
        >
          {tCommon("startRecurring")}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mia-arrow-next">
            <path d="M14 6l-6 6 6 6" />
          </svg>
        </Link>
      </div>
    </section>
  );
}

/* ── Donor account ──────────────────────────────────────────────────────────
 * Mirrors the account page's four sections: donation log, impact wallet,
 * document library, giving plans. */
const ACCOUNT_FEATURES = [
  { titleKey: "donationLog", textKey: "donationLogText", path: "M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6" },
  { titleKey: "impactWallet", textKey: "impactWalletText", path: "M12 21v-8m0 0C12 9 9 6 5 6c0 4 3 7 7 7Zm0 0c0-4 3-7 7-7 0 4-3 7-7 7Z" },
  { titleKey: "docsLibrary", textKey: "docsLibraryText", path: "M4 6h5l2 2h9v10a2 2 0 0 1-2 2H4V6Z" },
  { titleKey: "givingPlans", textKey: "givingPlansText", path: "M8 3v3M16 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v13H4V7a1 1 0 0 1 1-1ZM12 12v3l2 1" },
] as const;

export function AccountSection({ signedIn }: { signedIn: boolean }) {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const accountHref = miaPath("account", locale);
  const signInHref = `/auth/signin?callbackUrl=${encodeURIComponent(accountHref)}`;

  return (
    <section id="account" style={{ position: "relative", zIndex: 1, background: "linear-gradient(to left, rgba(247,242,234,.50), rgba(247,242,234,.76))", padding: "56px 0", borderTop: "1px solid var(--border)", overflow: "hidden" }}>
      <div id="account-grid" style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "minmax(0,.82fr) minmax(0,1.18fr)", gap: 44, alignItems: "center" }}>
        <div style={{ display: "grid", gap: 14, justifyItems: "start" }}>
          <h2 style={{ margin: 0, fontSize: "clamp(24px,2.4vw,34px)", lineHeight: 1.25, fontWeight: 900, letterSpacing: "-.01em" }}>{t("accountTitle")}</h2>
          <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.85, fontSize: 15.5, maxWidth: "46ch" }}>{t("accountLead")}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            {/* A signed-in donor is sent straight to their account; the pair of
                CTAs is only meaningful for a visitor without a session. */}
            {signedIn ? (
              <Button variant="primary" href={accountHref} style={{ whiteSpace: "nowrap" }}>
                {t("accountTitle")}
              </Button>
            ) : (
              <>
                <Button variant="primary" href={signInHref} style={{ whiteSpace: "nowrap" }}>
                  {t("createAccount")}
                </Button>
                <Button variant="light" href={signInHref} style={{ whiteSpace: "nowrap" }}>
                  {t("signIn")}
                </Button>
              </>
            )}
          </div>
        </div>
        <div id="account-features" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 14 }}>
          {ACCOUNT_FEATURES.map((feature) => (
            <Link
              key={feature.titleKey}
              href={signedIn ? accountHref : signInHref}
              className="mia-lift"
              style={{ display: "grid", gap: 9, alignContent: "start", padding: "22px 20px", background: "#fff", border: "1px solid var(--border)", borderTop: "3px solid var(--gold)", borderRadius: 12 }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#D39A27" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={feature.path} />
              </svg>
              <b style={{ fontSize: 15.5, lineHeight: 1.45 }}>{t(feature.titleKey)}</b>
              <span style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.75 }}>{t(feature.textKey)}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
