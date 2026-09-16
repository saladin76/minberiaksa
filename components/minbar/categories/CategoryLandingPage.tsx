"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import { miaPath } from "@/lib/minbar/routes";
import { youtubeEmbed, youtubeThumb } from "@/lib/minbar/content/media";
import { addToCart, type CartFreqKey } from "@/lib/minbar/cart";
import { formatMoney } from "@/lib/minbar/money";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import { useMinbarCountUp } from "@/hooks/useMinbarReveal";
import ProjectDonateCard from "@/components/minbar/ProjectDonateCard";
import VideoModal, { useVideoModal } from "@/components/minbar/VideoModal";
import { NoProjects } from "@/components/minbar/states/ContentStates";
import Rail from "@/components/minbar/Rail";
import { ArrowGlyph } from "@/components/minbar/home/TopSections";
import type { CategoryPageContent } from "@/lib/minbar/category-page";
import { CategoryCardIcon } from "./CategoryCardIcon";

/**
 * A category's landing page — ported from
 * `Minbar/مشروع ترميم منازل القدس.dc.html`.
 *
 * Every category is published this way: a hero with the programme's film, a
 * navy band of figures over a progress bar, the values it stands on, its
 * campaigns as the site's own donate cards, a donation box scoped to the
 * category, three explanatory cards, and its achievements in video.
 *
 * Nothing here is hard-coded: `lib/minbar/category-page.ts` resolves every
 * string for the visitor's locale, and each section is skipped when its data is
 * empty — so a category with only a name still renders as a hero and its
 * campaigns rather than as a page of blank frames.
 */

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;
const DEFAULT_AMOUNTS = [100, 200, 300, 500, 700, 1000, 1500, 2000, 3000];

const FREQUENCIES: ReadonlyArray<{ id: CartFreqKey; key: string }> = [
  { id: "once", key: "oneTime" },
  { id: "daily", key: "daily" },
  { id: "friday", key: "everyFriday" },
  { id: "monthly", key: "monthly" },
];

function CardIcon({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 9, background: "#fff", color: "var(--gold)" }}
    >
      <CategoryCardIcon name={name} className="h-[18px] w-[18px]" />
    </span>
  );
}

/** One figure of the band, counting up as it comes into view. */
function StatFigure({ value, label }: { value: number; label: string }) {
  const locale = useLocale();
  const { ref, value: shown } = useMinbarCountUp(value, 1400);
  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} style={{ display: "grid", gap: 4 }}>
      <b dir="ltr" style={{ unicodeBidi: "isolate", fontSize: "clamp(24px,2.4vw,32px)", fontWeight: 900, color: "var(--gold)" }}>
        {new Intl.NumberFormat(locale).format(shown)}
      </b>
      <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.72)" }}>{label}</span>
    </div>
  );
}

export default function CategoryLandingPage({ page }: { page: CategoryPageContent }) {
  const locale = useLocale();
  const rtl = localeDirection(locale) === "rtl";
  const t = useTranslations("common");
  const tHome = useTranslations("homepage");
  const tCampaigns = useTranslations("CampaignsPage");
  const { format, currency: selectedCurrency } = useMinbarMoney();
  const video = useVideoModal();

  /* Money, the same contract as the homepage's quick-donation card: the chips
     are USD, shown converted to the visitor's currency — UNLESS the dashboard
     gave that currency its own list, in which case those are shown as they are
     and go to the cart in that currency. The free field is always in the
     visitor's currency: the symbol beside the total is what they see, so that
     is what they give. */
  const visitorCode = selectedCurrency && selectedCurrency !== "DEFAULT" ? selectedCurrency : "USD";
  const override = visitorCode !== "USD" ? page.suggestedByCurrency[visitorCode] : undefined;
  const amounts = override?.length ? override : page.suggestedAmounts.length ? page.suggestedAmounts : DEFAULT_AMOUNTS;
  const chipCurrency = override?.length ? visitorCode : "USD";
  const suggested = amounts[Math.min(2, amounts.length - 1)];

  const [picked, setPicked] = useState(suggested);
  const [custom, setCustom] = useState("");
  const [freq, setFreq] = useState<CartFreqKey>("once");
  const [added, setAdded] = useState(false);

  /* Switching to a currency with its own list can orphan the chosen chip. */
  useEffect(() => {
    if (!custom && !amounts.includes(picked)) setPicked(suggested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chipCurrency]);

  const total = custom ? Number(custom) : picked;
  const totalCurrency = custom ? visitorCode : chipCurrency;
  const showMoney = (value: number, code: string) => (code === "USD" ? format(value) : formatMoney(value, code, locale));

  /* Only identifiers reach the cart — a campaign slug or a category id, a
     numeric amount and an ISO currency — because the cart resolves titles live
     from the active locale. A category row carries the category's id (its
     slugs differ per locale) and becomes a category line of the order. */
  const addCategoryDonation = () => {
    if (!(total > 0) || !page.donateTarget) return;
    const target =
      page.donateTarget.kind === "category"
        ? { categoryId: page.donateTarget.id }
        : { projectId: page.donateTarget.slug };
    addToCart({ ...target, typeKey: "project", freqKey: freq, amount: total, currency: totalCurrency });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  };

  const pill = (active: boolean): CSSProperties => ({
    height: 38,
    padding: "0 14px",
    borderRadius: 999,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 800,
    textAlign: "center",
    whiteSpace: "nowrap",
    border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`,
    background: active ? "var(--gold)" : "var(--ivory)",
    color: active ? "var(--deep)" : "var(--muted)",
    boxShadow: active ? "0 0 0 3px rgba(211,154,39,.22)" : "none",
    transition: "all .18s cubic-bezier(.22,.61,.36,1)",
  });

  return (
    <div className="cat-page">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", background: "var(--deep)", overflow: "hidden" }}>
        {page.heroImage ? (
          /* eslint-disable-next-line @next/next/no-img-element -- fills the section; not a fixed-size image */
          <img
            src={page.heroImage}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 35%" }}
          />
        ) : null}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(to ${rtl ? "left" : "right"}, rgba(16,33,43,.35) 0%, rgba(16,33,43,.15) 38%, transparent 62%)`,
            pointerEvents: "none",
          }}
        />
        <div
          className="cat-hero"
          style={{
            ...SECTION,
            position: "relative",
            padding: "140px 24px 110px",
            display: "grid",
            gridTemplateColumns: page.heroVideoId ? "minmax(0,1.05fr) minmax(0,.95fr)" : "minmax(0,1fr)",
            gap: 44,
            alignItems: "end",
          }}
        >
          <div
            className="cat-hero-box"
            /* Without a film beside it the box would stretch the full width and the
               lead would run to 120 characters; it is sized to its content instead. */
            style={{ display: "grid", gap: 18, justifyItems: "start", justifySelf: "start", maxWidth: page.heroVideoId ? "none" : "min(100%, 720px)", padding: "26px 28px", background: "rgba(16,33,43,.55)", borderRadius: 14, backdropFilter: "blur(2px)" }}
          >
            <h1 style={{ margin: 0, fontSize: "clamp(30px,3.6vw,50px)", lineHeight: 1.3, fontWeight: 900, color: "#fff" }}>{page.name}</h1>
            {page.heroLead ? (
              <p style={{ margin: 0, maxWidth: "58ch", fontSize: 16.5, lineHeight: 1.95, color: "rgba(255,255,255,.9)" }}>{page.heroLead}</p>
            ) : null}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a
                href="#category-projects"
                className="cat-ghost"
                style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 52, padding: "0 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,.5)", color: "#fff", fontWeight: 800, fontSize: 15.5 }}
              >
                {page.ctaLabel || page.projectsTitle || tCampaigns("allCampaigns")}
                <ArrowGlyph size={14} />
              </a>
              <a
                href="#category-donate"
                style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 52, padding: "0 24px", borderRadius: 10, background: "var(--red)", border: "1px solid var(--red)", color: "#fff", fontWeight: 900, fontSize: 15.5 }}
              >
                {t("donateNow")}
              </a>
            </div>
          </div>

          {page.heroVideoId ? (
            <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: "#10212B", boxShadow: "0 24px 60px rgba(2,34,34,.45)", border: "1px solid rgba(255,255,255,.22)" }}>
              <iframe
                src={youtubeEmbed(page.heroVideoId)}
                title={page.name}
                loading="lazy"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* ── The figures ────────────────────────────────────────────────── */}
      {page.stats ? (
        <section style={{ position: "relative", zIndex: 1, background: "var(--navy)", padding: "26px 0" }}>
          <div
            className="cat-stats"
            style={{ ...SECTION, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 18, textAlign: "center" }}
          >
            <StatFigure value={page.stats.done} label={page.stats.doneLabel} />
            <StatFigure value={page.stats.goal} label={page.stats.goalLabel} />
          </div>
          <div style={{ maxWidth: 1240, margin: "18px auto 0", padding: "0 24px" }}>
            <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,.14)", overflow: "hidden" }}>
              <span
                className="cat-bar"
                style={{ display: "block", height: "100%", width: `${page.stats.percent}%`, borderRadius: 999, background: "var(--gold)" }}
              />
            </div>
          </div>
        </section>
      ) : null}

      {/* ── The values, then the campaigns ─────────────────────────────── */}
      <section id="category-projects" style={{ position: "relative", zIndex: 1, background: "var(--sand)", padding: "46px 0 52px", overflow: "hidden" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px", display: "grid", gap: 20 }}>
          {page.values.length ? (
            <div
              id="cat-values"
              style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(page.values.length, 5)},minmax(0,1fr))`, gap: 10 }}
            >
              {page.values.map((value) => (
                <span
                  key={value.id}
                  className="cat-value"
                  style={{ position: "relative", display: "grid", alignContent: "center", justifyItems: "center", minHeight: 86, padding: "14px 12px", background: "#fff", border: "1px solid var(--border)", borderTop: "3px solid var(--gold)", borderRadius: 8, boxShadow: "0 1px 2px rgba(16,33,43,.05)", fontSize: 12.5, fontWeight: 800, color: "var(--deep)", textAlign: "center", lineHeight: 1.65 }}
                >
                  {value.label}
                </span>
              ))}
            </div>
          ) : null}

          {page.projectsTitle ? (
            <h2 style={{ margin: "6px 0 0", fontSize: "clamp(21px,2vw,27px)", lineHeight: 1.3, fontWeight: 900 }}>{page.projectsTitle}</h2>
          ) : null}

          {page.projects.length ? (
            <div id="cat-projects-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
              {page.projects.map((project) => (
                <ProjectDonateCard key={project.id} project={project} tag={page.name} />
              ))}
            </div>
          ) : (
            <NoProjects />
          )}
        </div>
      </section>

      {/* ── The donation box ───────────────────────────────────────────── */}
      {page.donateTarget ? (
      <section id="category-donate" style={{ position: "relative", zIndex: 1, background: "var(--ivory)", padding: "44px 0 56px", overflow: "hidden" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px", display: "grid", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <b style={{ fontSize: 18 }}>{page.donateTitle || `${t("donateNow")} — ${page.name}`}</b>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>
              {page.donateNote || page.donateTarget?.title}
            </span>
          </div>

          <div
            id="cat-donate-box"
            style={{ position: "relative", display: "grid", gap: 18, padding: "24px 26px", background: "#fff", border: "1px solid rgba(211,154,39,.5)", borderRadius: 14, boxShadow: "0 18px 50px rgba(16,33,43,.12)", overflow: "hidden" }}
          >
            <span aria-hidden="true" style={{ position: "absolute", insetBlock: 0, insetInlineStart: 0, width: 6, background: "linear-gradient(180deg, var(--gold), rgba(211,154,39,.25))", pointerEvents: "none" }} />

            <div style={{ display: "grid", gap: 12 }}>
              <div id="cat-freqs" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: 3, background: "var(--sand)", borderRadius: 999, width: "fit-content" }}>
                {FREQUENCIES.map((f) => {
                  const active = freq === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFreq(f.id)}
                      aria-pressed={active}
                      style={{
                        height: 34,
                        padding: "0 14px",
                        borderRadius: 999,
                        cursor: "pointer",
                        border: 0,
                        background: active ? "var(--gold)" : "transparent",
                        color: active ? "var(--deep)" : "var(--muted)",
                        fontFamily: "inherit",
                        fontSize: 12.5,
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                        boxShadow: active ? "0 3px 8px rgba(211,154,39,.3)" : "none",
                        transition: "all .2s cubic-bezier(.22,.61,.36,1)",
                      }}
                    >
                      {t(f.key)}
                    </button>
                  );
                })}
              </div>

              <div id="cat-amounts" style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 8 }}>
                {amounts.map((value) => (
                  <button key={value} type="button" onClick={() => { setPicked(value); setCustom(""); }} aria-pressed={picked === value && !custom} style={pill(picked === value && !custom)}>
                    <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{showMoney(value, chipCurrency)}</span>
                  </button>
                ))}
                <input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))}
                  inputMode="decimal"
                  placeholder={t("customAmount")}
                  aria-label={t("customAmount")}
                  style={{
                    height: 38,
                    padding: "0 14px",
                    borderRadius: 999,
                    boxSizing: "border-box",
                    border: `1px solid ${custom ? "var(--gold)" : "var(--border)"}`,
                    background: "var(--ivory)",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 700,
                    width: "100%",
                  }}
                />
              </div>
            </div>

            <div style={{ height: 1, background: "var(--border)" }} />

            <div id="cat-donate-actions" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
              <b dir="ltr" style={{ fontSize: 22, color: "var(--deep)", unicodeBidi: "isolate", whiteSpace: "nowrap" }}>{showMoney(total || 0, totalCurrency)}</b>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={addCategoryDonation}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    height: 48,
                    padding: "0 18px",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 14,
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                    border: `1px solid ${added ? "var(--green)" : "var(--border)"}`,
                    background: added ? "rgba(31,122,77,.08)" : "#fff",
                    color: added ? "var(--green)" : "var(--deep)",
                    transition: "all .18s cubic-bezier(.22,.61,.36,1)",
                  }}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m4 8 2 11h12l2-11H4Z" />
                    <path d="m9 8 3-4 3 4M9 12v3M15 12v3" />
                  </svg>
                  {added ? t("added") : t("addToCart")}
                </button>
                <a
                  href={miaPath("cart", locale)}
                  onClick={addCategoryDonation}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 48, padding: "0 26px", borderRadius: 10, background: "var(--red)", color: "#fff", fontWeight: 900, fontSize: 15, whiteSpace: "nowrap" }}
                >
                  {t("donateNow")}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
      ) : null}

      {/* ── Why / what / impact ────────────────────────────────────────── */}
      {page.cards.length ? (
        <section style={{ position: "relative", zIndex: 1, padding: "60px 0 24px" }}>
          <div
            id="cat-cards"
            style={{ ...SECTION, display: "grid", gridTemplateColumns: `repeat(${Math.min(page.cards.length, 3)},minmax(0,1fr))`, gap: 18 }}
          >
            {page.cards.map((card) => (
              <div key={card.id} className="cat-card" style={{ display: "grid", gap: 10, padding: 24, background: "var(--sand)", borderRadius: 8, borderTop: "3px solid var(--gold)" }}>
                <CardIcon name={card.icon} />
                <b style={{ fontSize: 15.5 }}>{card.title}</b>
                <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.9, whiteSpace: "pre-line" }}>{card.body}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Achievements in video ──────────────────────────────────────── */}
      {page.achievements.length ? (
        <section style={{ position: "relative", zIndex: 1, padding: "34px 0 56px" }}>
          <div style={SECTION}>
            <Rail
              id="cat-achievements"
              step={472}
              prevLabel={t("prev")}
              nextLabel={t("next")}
              heading={
                <h2 style={{ margin: 0, fontSize: "clamp(21px,2vw,27px)", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" }}>
                  {page.achievementsTitle || tHome("achTitle")}
                </h2>
              }
            >
              {page.achievements.map((clip) => {
                const image = clip.thumbnail || (clip.youtubeId ? youtubeThumb(clip.youtubeId) : "");
                return (
                  <button
                    key={clip.id}
                    type="button"
                    className="mia-reel"
                    onClick={() => video.open(youtubeEmbed(clip.youtubeId, { autoplay: true, start: clip.startSeconds ?? undefined }))}
                    style={{ flex: "0 0 232px", position: "relative", display: "block", aspectRatio: "9 / 16", borderRadius: 18, overflow: "hidden", background: "var(--deep)", border: "1px solid var(--border)", padding: 0, cursor: "pointer", textAlign: "start" }}
                  >
                    {image ? (
                      <span role="img" aria-label={clip.title} style={{ position: "absolute", inset: 0, display: "block", backgroundImage: `url('${image}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
                    ) : null}
                    <span style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(16,33,43,.94) 8%, rgba(16,33,43,.55) 44%, rgba(16,33,43,.05) 74%)" }} />
                    <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                      <span style={{ display: "grid", placeItems: "center", width: 52, height: 52, borderRadius: "50%", background: "rgba(255,253,248,.94)", color: "var(--red)", boxShadow: "0 8px 22px rgba(0,0,0,.28)" }}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>
                      </span>
                    </span>
                    <span style={{ position: "absolute", insetInline: 14, bottom: 14, display: "grid", gap: 8 }}>
                      <b style={{ color: "#fff", fontWeight: 800, fontSize: 16, lineHeight: 1.45 }}>{clip.title}</b>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,.18)", color: "var(--gold)", fontSize: 11.5, fontWeight: 900 }}>
                        <span style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {tHome("watch")}
                          <ArrowGlyph size={12} />
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </Rail>
          </div>
        </section>
      ) : null}

      <VideoModal embed={video.embed} onClose={video.close} />
    </div>
  );
}
