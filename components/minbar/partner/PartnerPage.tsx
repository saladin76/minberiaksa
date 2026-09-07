"use client";

import { type FormEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { track } from "@vercel/analytics";
import { localeDirection } from "@/lib/locales";

/**
 * Become a partner — ported from `Minbar/كن شريكا.dc.html`.
 *
 * Three partnership tracks, then a short lead form. The handoff's `submitLead()`
 * is a placeholder timer; this posts to `POST /api/messages` under the
 * `PARTNERSHIP` subject, which routes it to the same inbox the dashboard reads.
 */

const TRACKS: ReadonlyArray<{ icon: string; title: string; text: string }> = [
  { icon: "company", title: "trackCompanyTitle", text: "trackCompanyText" },
  { icon: "organization", title: "trackOrgTitle", text: "trackOrgText" },
  { icon: "donor", title: "trackDonorTitle", text: "trackDonorText" },
];

const ICONS: Record<string, ReactElement> = {
  company: (
    <>
      <rect x="4" y="9" width="7" height="12" />
      <rect x="13" y="4" width="7" height="17" />
      <path d="M7 13h1M7 17h1M16 8h1M16 12h1M16 16h1" />
    </>
  ),
  organization: (
    <>
      <circle cx="7" cy="8" r="2.6" />
      <circle cx="17" cy="8" r="2.6" />
      <path d="M2.5 20c.6-3 2.3-4.7 4.5-4.7s3.9 1.7 4.5 4.7M12.5 20c.6-3 2.3-4.7 4.5-4.7s3.9 1.7 4.5 4.7" />
    </>
  ),
  donor: <path d="M12 21s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 7.5 3c0 5.3-7.5 10-7.5 10Z" />,
};

const EMAIL_RE = /\S+@\S+\.\S+/;

function field(invalid: boolean) {
  return {
    height: 46,
    border: `1px solid ${invalid ? "var(--red)" : "var(--border)"}`,
    borderRadius: 10,
    padding: "0 14px",
    fontSize: 14,
    boxSizing: "border-box" as const,
    unicodeBidi: "plaintext" as const,
  };
}

export default function PartnerPage() {
  const locale = useLocale();
  const dir = localeDirection(locale);
  const t = useTranslations("partner");

  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  const emailValid = EMAIL_RE.test(email);
  const heroGradient = `linear-gradient(to ${dir === "rtl" ? "left" : "right"}, #7C2318, #A93428)`;

  const fail = () => {
    setError(t("errorValidation"));
    setShake(true);
    clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => setShake(false), 350);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    if (!org.trim() || !emailValid) {
      fail();
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "PARTNERSHIP",
          /* The description of the proposed partnership is optional in the
             design but the inbox needs a body, so a blank one falls back to
             the form's own title rather than to invented text. The substance
             is then the organisation name and the address to reply to. */
          body: message.trim() || t("formTitle"),
          locale,
          guestName: org.trim(),
          guestEmail: email.trim(),
        }),
      });
      if (!res.ok) throw new Error("send failed");
      setSent(true);
      try {
        track("partner_lead_sent", { source: "minbar_partner", locale });
      } catch {}
    } catch {
      /* Nothing was delivered, so the form keeps what was typed. */
      fail();
      try {
        track("partner_lead_failed", { source: "minbar_partner", locale });
      } catch {}
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pt-page">
      <section style={{ position: "relative", zIndex: 1, background: heroGradient, overflow: "hidden" }}>
        <span aria-hidden="true" className="pt-hero-pattern" />
        <div className="pt-hero" style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "70px 24px", display: "grid", gap: 14, justifyItems: "start" }}>
          {/* The handoff computes this eyebrow and then never places it. It is
              translated in all 19 languages, so it is rendered here where it
              was plainly meant to go. */}
          <span className="pt-in" style={{ fontSize: 12.5, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.75)" }}>
            {t("eyebrow")}
          </span>
          <h1 className="pt-in pt-in-1" style={{ margin: 0, fontSize: "clamp(28px,3.2vw,42px)", lineHeight: 1.3, fontWeight: 900, color: "#fff" }}>
            {t("heroTitle")}
          </h1>
          <p className="pt-in pt-in-2" style={{ margin: 0, maxWidth: "58ch", fontSize: 15.5, lineHeight: 1.9, color: "rgba(255,255,255,.88)" }}>
            {t("metaDescription")}
          </p>
        </div>
      </section>

      <section style={{ position: "relative", zIndex: 1, background: "#fff", borderBottom: "1px solid var(--border)", padding: "56px 0" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gap: 22 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(21px,2vw,27px)", fontWeight: 900 }}>{t("tracksTitle")}</h2>
          <div className="pt-grid3">
            {TRACKS.map((item) => (
              <div
                key={item.title}
                className="pt-track"
                style={{ display: "grid", gap: 10, alignContent: "start", padding: 24, background: "var(--sand)", borderTop: "3px solid var(--gold)", borderRadius: 4 }}
              >
                <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 9, background: "rgba(211,154,39,.14)", color: "var(--gold)" }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {ICONS[item.icon]}
                  </svg>
                </span>
                <b style={{ fontSize: 17, lineHeight: 1.4 }}>{t(item.title)}</b>
                <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.85 }}>{t(item.text)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ position: "relative", zIndex: 1, background: "var(--sand)", padding: "56px 0" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 24px" }}>
          {sent ? (
            <div style={{ display: "grid", justifyItems: "center", gap: 14, padding: "44px 30px", textAlign: "center", background: "#fff", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 12px 32px rgba(16,33,43,.08)" }}>
              <span className="pt-pop" style={{ display: "grid", placeItems: "center", width: 56, height: 56, borderRadius: "50%", background: "rgba(31,122,77,.12)", color: "var(--green)" }}>
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{t("sentTitle")}</h2>
              <p style={{ margin: 0, maxWidth: "40ch", color: "var(--muted)", fontSize: 14.5, lineHeight: 1.9 }}>{t("sentText")}</p>
            </div>
          ) : (
            <form
              id="pform"
              onSubmit={onSubmit}
              noValidate
              className={`pt-in pt-in-2${shake ? " pt-shake" : ""}`}
              style={{ display: "grid", gap: 16, padding: 32, background: "#fff", border: "1px solid var(--border)", borderTop: "3px solid var(--gold)", borderRadius: 12, boxShadow: "0 12px 32px rgba(16,33,43,.08)" }}
            >
              <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 900 }}>{t("formTitle")}</h2>

              <div className="pt-pair" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{t("fieldOrg")}</span>
                  <input
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    autoComplete="organization"
                    aria-invalid={Boolean(error) && !org.trim()}
                    style={field(Boolean(error) && !org.trim())}
                  />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{t("fieldEmail")}</span>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    aria-invalid={Boolean(error) && !emailValid}
                    style={field(Boolean(error) && !emailValid)}
                  />
                </label>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{t("fieldType")}</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  style={{ ...field(false), height: "auto", padding: "12px 14px", resize: "vertical" }}
                />
              </label>

              {error ? (
                <span role="alert" style={{ fontSize: 13, fontWeight: 700, color: "var(--red)" }}>
                  {error}
                </span>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="pt-submit"
                style={{ height: 48, border: 0, borderRadius: 8, cursor: submitting ? "not-allowed" : "pointer", width: "fit-content", padding: "0 26px", background: "var(--red)", color: "#fff", fontFamily: "inherit", fontWeight: 900, fontSize: 15, transition: "filter .18s ease" }}
              >
                {submitting ? t("submitLabelSending") : t("submitLabel")}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
