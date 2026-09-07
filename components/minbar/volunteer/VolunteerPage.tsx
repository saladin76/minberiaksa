"use client";

import { type FormEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { track } from "@vercel/analytics";
import { localeDirection } from "@/lib/locales";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";

/**
 * Volunteer with us — ported from `Minbar/تطوع معنا.dc.html`.
 *
 * TRANSLATION GAP: this is the only page in the handoff written in hard-coded
 * Arabic — `Minbar/i18n/<lang>/` ships no `volunteer.json` in any of the 19
 * languages. Every string that had a reviewed key elsewhere uses it (name,
 * email, phone, "Volunteering Field", the received line, send / sending / send
 * another); the rest live in a new `volunteer` namespace whose non-Arabic
 * entries are an English rendering awaiting a translator.
 *
 * The handoff's `submitApplication()` is a placeholder timer. This posts to
 * `POST /api/messages` under the `VOLUNTEERING` subject.
 */

const TRACKS: ReadonlyArray<{ icon: string; title: string; text: string }> = [
  { icon: "translate", title: "track1Title", text: "track1Text" },
  { icon: "media", title: "track2Title", text: "track2Text" },
  { icon: "remote", title: "track3Title", text: "track3Text" },
  { icon: "remote", title: "track4Title", text: "track4Text" },
  { icon: "agent", title: "track5Title", text: "track5Text" },
];

const ICONS: Record<string, ReactElement> = {
  translate: (
    <>
      <path d="M4 5h9M8 3v2M6.5 8.5C7.5 11 10 13.5 13 14.5M11 8.5c-1 2.5-3.5 5-6.5 6" />
      <path d="m14 20 4-9 4 9M15.3 17h5.4" />
    </>
  ),
  media: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="m10 8 4 2.5-4 2.5V8Z" />
    </>
  ),
  remote: (
    <>
      <rect x="2" y="4" width="14" height="10" rx="2" />
      <path d="M6 20h6M9 14v6" />
      <path d="M17 8h4a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-4" />
    </>
  ),
  agent: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
      <path d="M12 4.5v-1M9 6l-1-1M15 6l1-1" />
    </>
  ),
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

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;

export default function VolunteerPage() {
  const locale = useLocale();
  const dir = localeDirection(locale);
  const t = useTranslations("volunteer");
  const tCommon = useTranslations("common");
  const tContact = useTranslations("contact");
  const tPartner = useTranslations("partner");

  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [trackIndex, setTrackIndex] = useState(0);
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  const emailValid = EMAIL_RE.test(email);
  const chosen = TRACKS[trackIndex] ?? TRACKS[0];
  const chosenTitle = t(chosen.title);
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

    if (!name.trim() || !emailValid) {
      fail();
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      /* The inbox has a phone column but none for country or volunteering
         track, and both are answers the applicant actually gave — so they lead
         the message body rather than being dropped on the way to the team. */
      const lines = [
        `${tCommon("volunteerField")}: ${chosenTitle}`,
        country.trim() ? `${t("countryLabel")}: ${country.trim()}` : null,
        bio.trim(),
      ].filter(Boolean);

      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "VOLUNTEERING",
          body: lines.join("\n"),
          locale,
          guestName: name.trim(),
          guestEmail: email.trim(),
          contactPhone: phone.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("send failed");
      setSubmitted(true);
      try {
        track("volunteer_application_sent", { source: "minbar_volunteer", locale });
      } catch {}
    } catch {
      /* Nothing was delivered, so the form keeps what was typed. */
      fail();
      try {
        track("volunteer_application_failed", { source: "minbar_volunteer", locale });
      } catch {}
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setName("");
    setCountry("");
    setEmail("");
    setPhone("");
    setTrackIndex(0);
    setBio("");
    setSubmitted(false);
    setError("");
  };

  const labelStyle = { fontSize: 12, fontWeight: 800, color: "var(--muted)" } as const;

  return (
    <div className="vl-page">
      <section id="hero" style={{ position: "relative", background: heroGradient, overflow: "hidden" }}>
        <div aria-hidden="true" className="ab-hero-pattern" />
        <div style={{ ...SECTION, position: "relative", padding: "56px 24px 52px", display: "grid", gap: 14, justifyItems: "start" }}>
          <h1 className="vl-in" style={{ margin: 0, fontSize: "clamp(28px,3.4vw,46px)", lineHeight: 1.35, fontWeight: 900, color: "#fff" }}>
            {t("heroTitle")}
          </h1>
          <p className="vl-in vl-in-1" style={{ margin: 0, maxWidth: "60ch", fontSize: 16, lineHeight: 1.9, color: "rgba(255,255,255,.92)" }}>
            {t("heroSubtitle")}
          </p>
        </div>
      </section>

      <section style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "60px 0" }}>
        <div style={SECTION}>
          <h2 style={{ margin: "0 0 26px", fontSize: "clamp(24px,2.6vw,34px)", lineHeight: 1.3, fontWeight: 900 }}>
            {tCommon("volunteerFields")}
          </h2>
          <div className="vl-grid">
            {TRACKS.map((item) => (
              <div
                key={item.title}
                className="vl-track"
                style={{ display: "grid", gap: 8, alignContent: "start", padding: 22, background: "var(--sand)", borderTop: "3px solid var(--gold)" }}
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

      <section style={{ background: "var(--sand)", padding: "60px 0" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px" }}>
          {submitted ? (
            <div style={{ display: "grid", justifyItems: "center", gap: 14, padding: "44px 30px", textAlign: "center", background: "#fff", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 12px 32px rgba(16,33,43,.08)" }}>
              <span className="vl-pop" style={{ display: "grid", placeItems: "center", width: 56, height: 56, borderRadius: "50%", background: "rgba(31,122,77,.12)", color: "var(--green)" }}>
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{tCommon("volunteerReceived")}</h2>
              <p style={{ margin: 0, maxWidth: "40ch", color: "var(--muted)", fontSize: 14.5, lineHeight: 1.9 }}>
                {t("receivedNote", { field: chosenTitle })}
              </p>
              <button
                type="button"
                onClick={reset}
                className="vl-again"
                style={{ height: 42, padding: "0 20px", border: "1px solid var(--border)", borderRadius: 10, background: "#fff", color: "var(--deep)", fontFamily: "inherit", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}
              >
                {tContact("sendAnother")}
              </button>
            </div>
          ) : (
            <form
              id="vform"
              onSubmit={onSubmit}
              noValidate
              className={`vl-in vl-in-2${shake ? " vl-shake" : ""}`}
              style={{ display: "grid", gap: 16, padding: 32, background: "#fff", border: "1px solid var(--border)", borderTop: "3px solid var(--gold)", borderRadius: 12, boxShadow: "0 12px 32px rgba(16,33,43,.08)" }}
            >
              <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 900 }}>{t("formTitle")}</h2>

              <div className="vl-pair" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={labelStyle}>{tContact("nameLabel")}</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    aria-invalid={Boolean(error) && !name.trim()}
                    style={field(Boolean(error) && !name.trim())}
                  />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={labelStyle}>{t("countryLabel")}</span>
                  <input value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country-name" style={field(false)} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={labelStyle}>{tContact("emailLabel")}</span>
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
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={labelStyle}>{tContact("phoneLabel")}</span>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" type="tel" autoComplete="tel" style={field(false)} />
                </label>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={labelStyle}>{tCommon("volunteerField")}</span>
                {/* The value is the track's index, not its title: a title is
                    translated and would stop matching once it changes. */}
                <select
                  value={trackIndex}
                  onChange={(e) => setTrackIndex(Number(e.target.value))}
                  style={{ height: 46, border: "1px solid var(--border)", borderRadius: 10, padding: "0 14px", fontSize: 14, background: "#fff", cursor: "pointer", boxSizing: "border-box" }}
                >
                  {TRACKS.map((item, index) => (
                    <option key={item.title} value={index}>
                      {t(item.title)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={labelStyle}>{t("bioLabel")}</span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
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
                className="vl-submit"
                style={{ height: 48, border: 0, borderRadius: 999, cursor: submitting ? "not-allowed" : "pointer", width: "fit-content", padding: "0 28px", background: "var(--red)", color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 900, transition: "filter .18s ease" }}
              >
                {submitting ? tPartner("submitLabelSending") : tPartner("submitLabel")}
              </button>
            </form>
          )}
        </div>
      </section>

      <ZakatBanner />
      <TravelBanner />
      <IbadanBanner />
    </div>
  );
}
