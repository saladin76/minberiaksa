"use client";

import { useState, type CSSProperties, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useMessages, useTranslations } from "next-intl";
import { Button } from "@/components/minbar/ds";
import { miaPath } from "@/lib/minbar/routes";
import { addToCart, type CartFreqKey } from "@/lib/minbar/cart";
import { verseBlock } from "@/lib/minbar/quran";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import type { MinbarProject } from "@/lib/minbar/projects";

/**
 * Recurring giving — ported from `Minbar/التبرع الدوري.dc.html`.
 *
 * The flow the handoff specifies:
 *   Fund → Frequency → Amount → Currency → Timing → Review → Payment
 *
 * Timing is the part with real backend weight. `DONATION_LOGIC_SPEC §1.3` and
 * the Recurring Time Contract require a plan to store its **timezone**, its
 * schedule type, and its schedule rule *as structure* — `{dayOfMonth: 15}`, not
 * "the fifteenth" — with `nextChargeAt` computed on the server. A prayer-linked
 * charge additionally stores the location and prayer rule and is recalculated
 * each run, so daylight saving and shifting prayer times are absorbed rather
 * than baked into a stored offset.
 *
 * This form collects exactly that structure. It never computes a charge date:
 * `RECURRING_DONATION_FLOW_MAP.md` forbids relying on the donor's browser clock
 * for a withdrawal.
 *
 * The cart stores `freqKey` (`once`/`daily`/`friday`/`monthly`); the backend
 * normalises that to the official `donationMode`/`frequency` pair and never
 * reuses `freqKey` in an external API.
 */

type TimeMode = "prayer" | "local";

const AMOUNTS = [25, 50, 100, 250, 500];

const FREQUENCIES: ReadonlyArray<{ id: Exclude<CartFreqKey, "once">; labelKey: string; icon: ReactElement }> = [
  {
    id: "monthly",
    labelKey: "freqMonthly",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    id: "friday",
    labelKey: "freqFriday",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4" />
      </>
    ),
  },
  {
    id: "daily",
    labelKey: "freqDaily",
    icon: (
      <>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
      </>
    ),
  },
];

/** The five daily prayers, each with its own drawn glyph. */
const PRAYERS: ReadonlyArray<{ key: string; labelKey: string; icon: ReactElement }> = [
  {
    key: "Fajr",
    labelKey: "prayerFajr",
    icon: (
      <>
        <path d="M12 2v4" />
        <circle cx="12" cy="14" r="4.2" />
        <path d="M2 21h20M2 17h20M5.5 9.5l1.4 1.4M18.5 9.5l-1.4 1.4" />
      </>
    ),
  },
  {
    key: "Dhuhr",
    labelKey: "prayerDhuhr",
    icon: (
      <>
        <circle cx="12" cy="11" r="4.2" />
        <path d="M12 3v2M12 17v2M3.5 11h2M18.5 11h2M6 5.5l1.4 1.4M18 5.5l-1.4 1.4M6 16.5l1.4-1.4M18 16.5l-1.4-1.4" />
      </>
    ),
  },
  {
    key: "Asr",
    labelKey: "prayerAsr",
    icon: (
      <>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 3.5v2M4.5 12h2M19.5 12h2M6.6 6.6l1.4 1.4M17.4 6.6l-1.4 1.4" />
      </>
    ),
  },
  {
    key: "Maghrib",
    labelKey: "prayerMaghrib",
    icon: (
      <>
        <circle cx="12" cy="14" r="4.2" />
        <path d="M4.5 14h2M17.5 14h2M7 8.5l1.4 1.4M17 8.5l-1.4 1.4M2 21h20" />
      </>
    ),
  },
  {
    key: "Isha",
    labelKey: "prayerIsha",
    icon: <path d="M19.8 13.6a7.5 7.5 0 1 1-9.4-9.4 6.2 6.2 0 0 0 9.4 9.4Z" />,
  },
];

const BENEFITS = [
  { id: "sustain", image: "/minbar/assets/icon-recurring-sustain.png" },
  { id: "duty", image: "/minbar/assets/icon-recurring-duty.png" },
  { id: "fund", image: "/minbar/assets/icon-recurring-fund.png" },
  { id: "habit", image: "/minbar/assets/icon-recurring-habit.png" },
] as const;

/**
 * Funds a recurring plan can serve. `ibadan` and `travel` take their titles
 * from `navigation`, where those two projects are already named.
 */
const SERVED: ReadonlyArray<{ id: string; titleNs: "recurring" | "navigation"; titleKey: string }> = [
  { id: "aqsa", titleNs: "recurring", titleKey: "fund_aqsa" },
  { id: "relief", titleNs: "recurring", titleKey: "fund_relief" },
  { id: "homes", titleNs: "recurring", titleKey: "fund_homes" },
  { id: "chairs", titleNs: "recurring", titleKey: "fund_chairs" },
  { id: "quran", titleNs: "recurring", titleKey: "fund_quran" },
  { id: "families", titleNs: "recurring", titleKey: "fund_families" },
  { id: "ibadan", titleNs: "navigation", titleKey: "ibadanProject" },
  { id: "travel", titleNs: "navigation", titleKey: "travelProject" },
];

/** Days 1–28 only: every month has them, so a plan can never skip a month. */
const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export interface RecurringPageProps {
  projects: MinbarProject[];
}

export default function RecurringPage({ projects }: RecurringPageProps) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("recurring");
  const tCommon = useTranslations("common");
  const tNav = useTranslations("navigation");
  const { format, formatNumber } = useMinbarMoney();
  const messages = useMessages() as { quran?: Record<string, { ar?: string; label?: string; t?: string }> };
  const verse = verseBlock(messages.quran ?? {}, "baqarah_261", locale);

  const [projectSlug, setProjectSlug] = useState<string | null>(null);
  const [amount, setAmount] = useState(100);
  const [custom, setCustom] = useState("");
  const [freq, setFreq] = useState<Exclude<CartFreqKey, "once">>("monthly");
  const [timeMode, setTimeMode] = useState<TimeMode>("prayer");
  const [prayer, setPrayer] = useState("Dhuhr");
  const [localTime, setLocalTime] = useState("14:30");
  const [monthDay, setMonthDay] = useState(1);
  const [notes, setNotes] = useState("");

  const value = custom ? Number(custom) : amount;
  const selectedProject = projects.find((p) => p.slug === projectSlug) ?? null;

  const onDonate = () => {
    if (!(value > 0)) return;
    addToCart({
      // A plan against a specific project carries its id; otherwise it is the
      // general recurring fund, named by its translated key.
      projectId: selectedProject?.slug,
      titleKey: selectedProject ? undefined : "whereNeedGreatest",
      title: selectedProject?.title,
      typeKey: "recurring",
      freqKey: freq,
      amount: value,
      currency: "USD",
    });
    router.push(miaPath("cart", locale));
  };

  const stepBadge = (n: number) => (
    <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--sand)", color: "var(--gold)", display: "grid", placeItems: "center", fontSize: 11 }}>
      {formatNumber(n)}
    </span>
  );

  const pill = (active: boolean): CSSProperties => ({
    height: 44,
    padding: "0 18px",
    borderRadius: 999,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 800,
    border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`,
    background: active ? "var(--sand)" : "#fff",
    color: active ? "var(--deep)" : "var(--muted)",
    transition: "all .18s ease",
  });

  const segment = (active: boolean): CSSProperties => ({
    height: 42,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 999,
    border: 0,
    background: active ? "#fff" : "transparent",
    color: active ? "var(--deep)" : "var(--muted)",
    fontFamily: "inherit",
    fontSize: 13.5,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: active ? "0 2px 8px rgba(16,33,43,.1)" : "none",
    transition: "all .18s ease",
  });

  return (
    <div style={{ position: "relative" }}>
      {/* ── Plan builder ─────────────────────────────────────────────────── */}
      <section id="plan" style={{ position: "relative", background: "var(--ivory)", borderBottom: "1px solid var(--border)", overflow: "hidden" }}>
        <div aria-hidden="true" data-aqsa-pattern="" style={pattern(520)} />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "54px 24px 56px", display: "grid", gap: 30 }}>
          <div style={{ display: "grid", gap: 16, justifyItems: "center", textAlign: "center" }}>
            {/* Al-Baqarah 261 — the verse on multiplied reward. Arabic always. */}
            <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 14, maxWidth: "74ch", fontFamily: "var(--font-quran)", color: "var(--deep)", fontSize: "clamp(15px,1.5vw,17px)", lineHeight: 1.9 }}>
              <span aria-hidden="true" style={{ flex: "1 1 auto", height: 1, background: "rgba(211,154,39,.4)", maxWidth: 60 }} />
              <span dir="rtl">{verse.arabic}</span>
              <span aria-hidden="true" style={{ flex: "1 1 auto", height: 1, background: "rgba(211,154,39,.4)", maxWidth: 60 }} />
            </p>
            {verse.translation ? (
              <>
                <p style={{ margin: "8px 0 0", maxWidth: "72ch", fontSize: 14, lineHeight: 1.85, color: "var(--muted)", textWrap: "pretty" }}>{verse.translation}</p>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 10.5, color: "var(--muted)", opacity: 0.8 }}>
                  <span aria-hidden="true" style={{ width: 20, height: 1, background: "rgba(211,154,39,.5)" }} />
                  {verse.attribution}
                  <span aria-hidden="true" style={{ width: 20, height: 1, background: "rgba(211,154,39,.5)" }} />
                </span>
              </>
            ) : null}

            <h1 style={{ margin: "4px 0 0", fontSize: "clamp(30px,3.6vw,48px)", lineHeight: 1.55, fontWeight: 900 }}>
              {t("title1")} <span style={{ color: "var(--gold)" }}>{t("title2")}</span>
            </h1>
            <div style={{ maxWidth: "62ch", marginTop: 6, display: "grid", gap: 10 }}>
              <b style={{ fontSize: 17, fontWeight: 900, color: "var(--deep)", lineHeight: 1.6 }}>{t("lead")}</b>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 2.05, color: "var(--muted)" }}>{t("investmentLead")}</p>
            </div>
          </div>

          <div id="rc-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,.8fr) minmax(0,1.2fr)", gap: 26, alignItems: "stretch" }}>
            <span className="rc-video" style={{ position: "relative", display: "block", background: "#000", borderRadius: 16, overflow: "hidden", minHeight: 420, boxShadow: "0 18px 44px rgba(16,33,43,.14)", transition: "box-shadow .25s ease, transform .25s ease" }}>
              <iframe
                src="https://www.youtube.com/embed/K65JuQ8Nz9g?si=TCfoRDQ9caOL53Wi"
                title={t("whatIsIt")}
                loading="lazy"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </span>

            <div style={{ display: "grid", gap: 22, alignContent: "start", padding: 32, background: "#fff", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "0 18px 44px rgba(16,33,43,.1)" }}>
              {/* Step 1 — fund */}
              <div style={{ display: "grid", gap: 9 }}>
                <span style={stepLabel}>
                  {stepBadge(1)}
                  {t("chooseFund")}
                </span>
                <select
                  value={projectSlug ?? ""}
                  onChange={(e) => setProjectSlug(e.target.value || null)}
                  aria-label={t("chooseFund")}
                  className="rc-select"
                  style={{ minHeight: 50, border: "1px solid var(--border)", borderRadius: 10, padding: "0 14px", fontFamily: "inherit", fontSize: 15, fontWeight: 800, color: "var(--deep)", background: "var(--ivory)", cursor: "pointer", transition: "border-color .18s ease" }}
                >
                  <option value="">{tCommon("whereNeedGreatest")}</option>
                  {projects.map((project) => (
                    <option key={project.slug} value={project.slug}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2 — amount */}
              <div style={{ display: "grid", gap: 9 }}>
                <span style={stepLabel}>
                  {stepBadge(2)}
                  {t("setAmount")}
                </span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {AMOUNTS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        setAmount(v);
                        setCustom("");
                      }}
                      className="rc-amt"
                      style={pill(amount === v && !custom)}
                    >
                      <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
                        {format(v)}
                      </span>
                    </button>
                  ))}
                  <input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="decimal"
                    placeholder={tCommon("suggestedAmount")}
                    aria-label={tCommon("suggestedAmount")}
                    className="rc-input"
                    style={{ width: 110, minWidth: 0, height: 44, padding: "0 14px", boxSizing: "border-box", border: `1px solid ${custom ? "var(--gold)" : "var(--border)"}`, borderRadius: 999, background: "#fff", color: "var(--deep)", fontFamily: "inherit", fontSize: 15, fontWeight: 800 }}
                  />
                </div>
              </div>

              {/* Step 3 — frequency */}
              <div style={{ display: "grid", gap: 9 }}>
                <span style={stepLabel}>
                  {stepBadge(3)}
                  {tCommon("frequency")}
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, padding: 4, background: "var(--sand)", borderRadius: 12 }}>
                  {FREQUENCIES.map((f) => (
                    <button key={f.id} type="button" onClick={() => setFreq(f.id)} className="rc-seg" style={{ ...segment(freq === f.id), borderRadius: 9 }}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        {f.icon}
                      </svg>
                      {tCommon(f.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Schedule. Stored as structure — a day number and either a prayer
                  key or a wall-clock time — never as a sentence. */}
              <div style={{ display: "grid", gap: 12, padding: 16, background: "var(--ivory)", border: "1px solid var(--border)", borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 7, background: "var(--sand)", display: "grid", placeItems: "center", color: "var(--gold)" }}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 3" />
                    </svg>
                  </span>
                  <b style={{ fontSize: 12.5, fontWeight: 900, color: "var(--deep)" }}>{t("schedule")}</b>
                </div>

                {freq === "monthly" ? (
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)" }}>{t("dayOfMonth")}</span>
                    <select
                      value={monthDay}
                      onChange={(e) => setMonthDay(Number(e.target.value))}
                      style={{ width: "100%", minWidth: 0, boxSizing: "border-box", height: 40, border: "1px solid var(--border)", borderRadius: 8, background: "#fff", padding: "0 14px", fontFamily: "inherit", fontWeight: 800, fontSize: 13.5, color: "var(--deep)", cursor: "pointer" }}
                    >
                      {MONTH_DAYS.map((d) => (
                        <option key={d} value={d}>
                          {formatNumber(d)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <div style={{ display: "grid", gap: 7 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)" }}>{t("timeOfDay")}</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6, padding: 4, background: "var(--sand)", borderRadius: 999 }}>
                    <button type="button" onClick={() => setTimeMode("prayer")} className="rc-seg" style={segment(timeMode === "prayer")}>
                      {t("prayerTime")}
                    </button>
                    <button type="button" onClick={() => setTimeMode("local")} className="rc-seg" style={segment(timeMode === "local")}>
                      {t("localTime")}
                    </button>
                  </div>

                  {timeMode === "prayer" ? (
                    <div id="rc-prayers" style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 6 }}>
                      {PRAYERS.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setPrayer(p.key)}
                          className="rc-prayer"
                          style={{
                            display: "grid",
                            justifyItems: "center",
                            gap: 5,
                            padding: "10px 4px",
                            borderRadius: 10,
                            border: `1px solid ${prayer === p.key ? "var(--gold)" : "var(--border)"}`,
                            background: prayer === p.key ? "var(--sand)" : "#fff",
                            color: prayer === p.key ? "var(--deep)" : "var(--muted)",
                            fontFamily: "inherit",
                            fontSize: 11.5,
                            fontWeight: 800,
                            cursor: "pointer",
                            transition: "all .18s ease",
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            {p.icon}
                          </svg>
                          {t(p.labelKey)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, height: 46, padding: "0 14px", background: "#fff", border: "1px solid var(--border)", borderRadius: 8 }}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 3" />
                      </svg>
                      <input
                        type="time"
                        value={localTime}
                        onChange={(e) => setLocalTime(e.target.value)}
                        dir="ltr"
                        aria-label={t("localTime")}
                        style={{ flex: "1 1 auto", background: "transparent", border: 0, fontFamily: "inherit", fontSize: 15, fontWeight: 900, color: "var(--deep)", unicodeBidi: "plaintext", outline: "none" }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <label style={{ display: "grid", gap: 7 }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: "var(--muted)", letterSpacing: ".04em" }}>{t("notes")}</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder={tCommon("notesPlaceholder")}
                  className="rc-input"
                  style={{ width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 10, background: "var(--ivory)", padding: "10px 14px", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, color: "var(--deep)", resize: "vertical", transition: "border-color .18s ease, box-shadow .18s ease" }}
                />
              </label>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "16px 20px", background: "var(--sand)", borderRadius: 12 }}>
                <span aria-hidden="true" style={{ flex: "0 0 auto", width: 36, height: 36, borderRadius: "50%", background: "#fff", display: "grid", placeItems: "center", color: "var(--gold)" }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 21s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 7.5 3c0 5.3-7.5 10-7.5 10Z" />
                  </svg>
                </span>
                <span style={{ flex: "1 1 auto", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 900, color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {t("amountPerX", { freq: tCommon(FREQUENCIES.find((f) => f.id === freq)?.labelKey ?? "freqMonthly") })}
                  </span>
                  <b dir="ltr" style={{ fontSize: 24, unicodeBidi: "isolate", color: "var(--deep)", whiteSpace: "nowrap" }}>
                    {format(value)}
                  </b>
                </span>
              </div>

              <Button variant="primary" size="lg" full onClick={onDonate} style={{ height: 54 }}>
                {t("createPlan")}
              </Button>

              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--muted)", fontSize: 12.5, textAlign: "center" }}>
                {t("privacyNote")}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── What recurring giving is ─────────────────────────────────────── */}
      <section id="what" style={{ background: "#fff", padding: "52px 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gap: 26 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
            <span style={{ flex: "0 0 auto", display: "grid", placeItems: "center", width: 60, height: 60, borderRadius: 16, background: "var(--sand)", color: "var(--gold)", boxShadow: "0 1px 2px rgba(16,33,43,.05)" }}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 21s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 7.5 3c0 5.3-7.5 10-7.5 10Z" />
              </svg>
            </span>
            <div style={{ flex: "1 1 460px", minWidth: 0, display: "grid", gap: 12 }}>
              <b style={{ fontSize: 20, color: "var(--deep)" }}>{t("whatIsIt")}</b>
              <span style={{ color: "var(--muted)", fontSize: 15, lineHeight: 2 }}>{t("whatIsText")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why give regularly ───────────────────────────────────────────── */}
      <section id="benefits" style={{ position: "relative", background: "var(--sand)", padding: "62px 0", overflow: "hidden" }}>
        <div aria-hidden="true" data-aqsa-pattern="" style={pattern(520)} />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
          <h2 style={{ margin: "0 0 26px", fontSize: "clamp(26px,2.8vw,38px)", lineHeight: 1.55, fontWeight: 900, color: "var(--deep)" }}>{t("whyIt")}</h2>
          <div id="rc-benefits" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 18 }}>
            {BENEFITS.map((benefit) => (
              <div key={benefit.id} className="mia-lift" style={{ display: "flex", alignItems: "flex-start", gap: 18, padding: 28, background: "#fff", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 1px 3px rgba(16,33,43,.05)" }}>
                <span style={{ flex: "0 0 auto", width: 60, height: 60, display: "grid", placeItems: "center", borderRadius: 16, background: "var(--sand)" }}>
                  <span
                    aria-hidden="true"
                    style={{ width: 36, height: 36, display: "block", backgroundImage: `url(${benefit.image})`, backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center" }}
                  />
                </span>
                <div style={{ display: "grid", gap: 7, minWidth: 0 }}>
                  <b style={{ fontSize: 17, lineHeight: 1.45, color: "var(--deep)" }}>{t(`benefit_${benefit.id}`)}</b>
                  <span style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.85 }}>{t(`benefitDesc_${benefit.id}`)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Funds a plan serves ──────────────────────────────────────────── */}
      <section id="projects" style={{ background: "#fff", padding: "62px 0", borderBlock: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "clamp(26px,2.8vw,38px)", lineHeight: 1.55, fontWeight: 900, color: "var(--deep)" }}>{t("fundsServed")}</h2>
          <p style={{ margin: "0 0 26px", maxWidth: "72ch", color: "var(--muted)", fontSize: 16, lineHeight: 1.9 }}>{t("fundsLead")}</p>
          <div id="rc-funds" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
            {SERVED.map((fund) => (
              <div key={fund.id} className="mia-lift" style={{ display: "grid", gap: 10, alignContent: "start", padding: 24, background: "var(--sand)", border: "1px solid var(--border)", borderRadius: 14, textAlign: "center", justifyItems: "center" }}>
                <span style={{ display: "grid", placeItems: "center", width: 68, height: 68, borderRadius: "50%", background: "#fff", color: "var(--gold)" }}>
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 21s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 7.5 3c0 5.3-7.5 10-7.5 10Z" />
                  </svg>
                </span>
                <b style={{ fontSize: 16, lineHeight: 1.4, color: "var(--deep)" }}>
                  {fund.titleNs === "navigation" ? tNav(fund.titleKey) : t(fund.titleKey)}
                </b>
                <span style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.8 }}>{t(`fundDesc_${fund.id}`)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section style={{ position: "relative", background: "linear-gradient(155deg, #132C38, #0c1e27)", padding: "56px 0", overflow: "hidden" }}>
        <div aria-hidden="true" data-aqsa-pattern="" style={{ ...pattern(520), opacity: 0.09 }} />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 10, flex: "1 1 460px", minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "clamp(24px,2.7vw,36px)", lineHeight: 1.3, fontWeight: 900, color: "#fff" }}>{t("ctaHeading")}</h2>
            <p style={{ margin: 0, color: "rgba(255,255,255,.8)", fontSize: 16, lineHeight: 1.9 }}>{t("ctaText")}</p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button variant="primary" size="lg" href="#plan" style={{ whiteSpace: "nowrap" }}>
              {t("createPlan")}
            </Button>
            <Button variant="outline" size="lg" href={miaPath("waqf", locale)} style={{ whiteSpace: "nowrap" }}>
              {t("waqfProjects")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

const stepLabel: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 12.5,
  fontWeight: 900,
  color: "var(--muted)",
  letterSpacing: ".04em",
};

const pattern = (size: number): CSSProperties => ({
  position: "absolute",
  inset: 0,
  backgroundImage: "url('/minbar/assets/patterns/aqsa-white-pattern.webp')",
  backgroundRepeat: "repeat",
  backgroundSize: `${size}px ${size}px`,
  opacity: 0.05,
  pointerEvents: "none",
});
