"use client";

import { type FormEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { track } from "@vercel/analytics";
import { localeDirection } from "@/lib/locales";
import { ORG, ORG_WHATSAPP } from "@/lib/minbar/org";
import type { MessageSubject } from "@/lib/messages/subjects";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";

/**
 * Contact us — ported from `Minbar/تواصل معنا.dc.html`.
 *
 * The handoff's `submitTicket()` is a 900ms `setTimeout` placeholder. This
 * version posts to the site's real inbox, `POST /api/messages`, which is what
 * the dashboard's Messages screen reads — so a message sent here is a message
 * an admin actually receives.
 */

/**
 * The five subjects the design offers, each mapped onto the inbox's routing
 * enum. Press and "other" both land in `GENERAL`: the enum has no press value,
 * and inventing one here would write a subject the dashboard cannot filter on.
 * The reader still sees the five distinct labels.
 */
const SUBJECTS: ReadonlyArray<{ key: string; subject: MessageSubject }> = [
  { key: "subjDonation", subject: "DONATION_ISSUE" },
  { key: "subjProject", subject: "CAMPAIGN_SUPPORT" },
  { key: "subjPartnership", subject: "PARTNERSHIP" },
  { key: "subjMedia", subject: "GENERAL" },
  { key: "subjOther", subject: "GENERAL" },
];

const ICONS: Record<string, ReactElement> = {
  pin: (
    <>
      <path d="M12 21s-7-5.2-7-11a7 7 0 1 1 14 0c0 5.8-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 6.5 8 6.5 8-6.5" />
    </>
  ),
  phone: (
    <path d="M6.6 10.5a13.5 13.5 0 0 0 6.9 6.9l2.3-2.3a1.5 1.5 0 0 1 1.5-.37 11 11 0 0 0 3.4.55 1.5 1.5 0 0 1 1.5 1.5V20a1.5 1.5 0 0 1-1.5 1.5A17.5 17.5 0 0 1 3 4.5 1.5 1.5 0 0 1 4.5 3h2.4a1.5 1.5 0 0 1 1.5 1.5 11 11 0 0 0 .55 3.4 1.5 1.5 0 0 1-.37 1.5Z" />
  ),
};

/**
 * Address, email and phone, in that order. Each carries its own direction: an
 * email and a phone number stay LTR inside an Arabic page, and the isolation
 * keeps a leading `+` from being pushed to the wrong end of the number.
 */
const CARDS: ReadonlyArray<{ icon: keyof typeof ICONS; labelKey: string; value: string; dir: "rtl" | "ltr" }> = [
  { icon: "pin", labelKey: "addressLabel", value: ORG.address, dir: "ltr" },
  { icon: "mail", labelKey: "emailLabel", value: ORG.email, dir: "ltr" },
  { icon: "phone", labelKey: "phoneLabel", value: ORG.phone, dir: "ltr" },
];

const EMAIL_RE = /\S+@\S+\.\S+/;

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;

function fieldStyle(invalid: boolean) {
  return {
    height: 46,
    border: `1px solid ${invalid ? "var(--red)" : "var(--border)"}`,
    borderRadius: 10,
    padding: "0 14px",
    fontSize: 14,
    boxSizing: "border-box" as const,
    /* The field can hold Arabic or Latin text; `plaintext` lets each entry
       align by its own first strong character rather than by the page. */
    unicodeBidi: "plaintext" as const,
  };
}

export default function ContactPage() {
  const locale = useLocale();
  const dir = localeDirection(locale);
  const t = useTranslations("contact");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subjectIndex, setSubjectIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  const emailValid = EMAIL_RE.test(email);
  const chosen = SUBJECTS[subjectIndex] ?? SUBJECTS[0];
  const heroGradient = `linear-gradient(to ${dir === "rtl" ? "left" : "right"}, #7C2318, #A93428)`;

  const fail = (text: string) => {
    setError(text);
    setShake(true);
    clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => setShake(false), 350);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    if (!name.trim() || !emailValid || !message.trim()) {
      fail(!emailValid && email.trim() ? t("errEmail") : t("errRequired"));
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: chosen.subject,
          body: message.trim(),
          locale,
          guestName: name.trim(),
          guestEmail: email.trim(),
        }),
      });
      if (!res.ok) throw new Error("send failed");
      setSubmitted(true);
      try {
        track("contact_message_sent", { source: "minbar_contact", subject: chosen.subject, locale });
      } catch {}
    } catch {
      /* The message was not delivered, so the form stays filled in: the sender
         can press send again without retyping what they wrote. */
      fail(t("errRequired"));
      try {
        track("contact_message_failed", { source: "minbar_contact", subject: chosen.subject, locale });
      } catch {}
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setName("");
    setEmail("");
    setSubjectIndex(0);
    setMessage("");
    setSubmitted(false);
    setError("");
  };

  return (
    <div className="cf-page">
      <section id="hero" style={{ position: "relative", background: heroGradient, overflow: "hidden" }}>
        <div aria-hidden="true" className="ab-hero-pattern" />
        <div style={{ ...SECTION, position: "relative", padding: "56px 24px 52px", display: "grid", gap: 14, justifyItems: "start" }}>
          <h1 className="cf-in" style={{ margin: 0, fontSize: "clamp(28px,3.4vw,46px)", lineHeight: 1.35, fontWeight: 900, color: "#fff" }}>
            {t("heroTitle")}
          </h1>
          <p className="cf-in cf-in-1" style={{ margin: 0, maxWidth: "60ch", fontSize: 16, lineHeight: 1.9, color: "rgba(255,255,255,.92)" }}>
            {t("heroSubtitle")}
          </p>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "60px 0" }}>
        <div className="cf-two" style={{ ...SECTION, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,.8fr)", gap: 46, alignItems: "start" }}>
          {submitted ? (
            <div style={{ display: "grid", justifyItems: "center", gap: 14, padding: "44px 30px", textAlign: "center", background: "#fff", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 12px 32px rgba(16,33,43,.08)" }}>
              <span className="cf-pop" style={{ display: "grid", placeItems: "center", width: 56, height: 56, borderRadius: "50%", background: "rgba(31,122,77,.12)", color: "var(--green)" }}>
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{t("received")}</h2>
              <p style={{ margin: 0, maxWidth: "40ch", color: "var(--muted)", fontSize: 14.5, lineHeight: 1.9 }}>
                {t("receivedNote", { subject: t(chosen.key) })}
              </p>
              <button
                type="button"
                onClick={reset}
                className="cf-again"
                style={{ height: 42, padding: "0 20px", border: "1px solid var(--border)", borderRadius: 10, background: "#fff", color: "var(--deep)", fontFamily: "inherit", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}
              >
                {t("sendAnother")}
              </button>
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              noValidate
              className={`cf-in cf-in-2${shake ? " cf-shake" : ""}`}
              style={{ display: "grid", gap: 16, padding: 30, background: "#fff", border: "1px solid var(--border)", borderTop: "3px solid var(--gold)", borderRadius: 12, boxShadow: "0 12px 32px rgba(16,33,43,.08)" }}
            >
              <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 900 }}>{t("formTitle")}</h2>

              <div className="cf-pair" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{t("nameLabel")}</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("namePlaceholder")}
                    autoComplete="name"
                    aria-invalid={Boolean(error) && !name.trim()}
                    style={fieldStyle(Boolean(error) && !name.trim())}
                  />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{t("emailLabel")}</span>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    dir="ltr"
                    placeholder="email@example.com"
                    autoComplete="email"
                    aria-invalid={Boolean(error) && !emailValid}
                    style={fieldStyle(Boolean(error) && !emailValid)}
                  />
                </label>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{t("subjectLabel")}</span>
                {/* The selected value is the option's index, not its label: a
                    label is translated and would stop matching once it changes. */}
                <select
                  value={subjectIndex}
                  onChange={(e) => setSubjectIndex(Number(e.target.value))}
                  style={{ height: 46, border: "1px solid var(--border)", borderRadius: 10, padding: "0 14px", fontSize: 14, background: "#fff", cursor: "pointer" }}
                >
                  {SUBJECTS.map((option, index) => (
                    <option key={option.key} value={index}>
                      {t(option.key)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{t("messageLabel")}</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder={t("messagePlaceholder")}
                  aria-invalid={Boolean(error) && !message.trim()}
                  style={{ ...fieldStyle(Boolean(error) && !message.trim()), height: "auto", padding: "12px 14px", resize: "vertical" }}
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
                className="cf-submit"
                style={{ height: 48, border: 0, borderRadius: 999, cursor: submitting ? "not-allowed" : "pointer", background: "var(--red)", color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 900, transition: "filter .18s ease" }}
              >
                {submitting ? t("sending") : t("sendMessage")}
              </button>
            </form>
          )}

          <div style={{ display: "grid", gap: 14 }}>
            {CARDS.map((card) => (
              <div
                key={card.labelKey}
                className="cf-card cf-in"
                style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "20px 22px", background: "var(--sand)", borderInlineStart: "3px solid var(--gold)" }}
              >
                <span aria-hidden="true" style={{ flex: "0 0 auto", display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 9, background: "rgba(211,154,39,.14)", color: "var(--gold)" }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    {ICONS[card.icon]}
                  </svg>
                </span>
                <span style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  <b style={{ fontSize: 12.5, fontWeight: 900, color: "var(--gold)", letterSpacing: ".04em" }}>{t(card.labelKey)}</b>
                  <span dir={card.dir} style={{ fontSize: 15, lineHeight: 1.8, color: "var(--deep)", unicodeBidi: "isolate" }}>
                    {card.value}
                  </span>
                </span>
              </div>
            ))}

            <a
              href={ORG_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="cf-in cf-in-2 cf-whatsapp"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", background: "var(--green)", color: "#fff", borderRadius: 10, fontWeight: 800, fontSize: 15 }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M12.04 2.5c-5.23 0-9.48 4.24-9.48 9.47 0 1.67.44 3.3 1.28 4.74L2.5 21.5l4.92-1.29a9.45 9.45 0 0 0 4.62 1.18h.01c5.22 0 9.47-4.24 9.47-9.47 0-2.53-.99-4.91-2.78-6.7a9.4 9.4 0 0 0-6.7-2.72Z" />
              </svg>
              {t("whatsappLabel")}
            </a>
          </div>
        </div>
      </section>

      <ZakatBanner />
      <TravelBanner />
      <IbadanBanner />
    </div>
  );
}
