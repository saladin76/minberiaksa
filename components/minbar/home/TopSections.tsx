"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LOCALES } from "@/lib/locales";
import StoryViewer, { type PublicStory } from "./StoryViewer";
import { useLocale, useMessages, useTranslations } from "next-intl";
import { Button } from "@/components/minbar/ds";
import Rail from "@/components/minbar/Rail";
import { miaPath } from "@/lib/minbar/routes";
import { verseBlock } from "@/lib/minbar/quran";
import { IMG } from "@/lib/minbar/content/media";
import { introVideoId } from "@/lib/minbar/content/catalog";
import { BIG_STATS } from "@/lib/minbar/achievements";
import { useMinbarCountUp } from "@/hooks/useMinbarReveal";
import { youtubeEmbed } from "@/lib/minbar/content/media";

/**
 * The top of the homepage — ported from `Minbar/الصفحة الرئيسية.dc.html`:
 * the Qur'anic verse strip, the story rail, and the hero.
 */

/* ── Verse strip ─────────────────────────────────────────────────────────────
 * Al-Isra 1, directly under the hero — the verse the whole site stands on.
 * The Arabic is shown in every language edition; the translation of the
 * meaning and its edition attribution appear beneath it in non-Arabic
 * sessions. See `lib/minbar/quran.ts` for why.
 *
 * It wraps. The earlier strip was a single non-wrapping line with an ellipsis,
 * which on a phone cut the verse mid-clause — the one text on the page that
 * must never be truncated. */
export function VerseStrip() {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const messages = useMessages() as { quran?: Record<string, { ar?: string; label?: string; t?: string }> };
  const verse = verseBlock(messages.quran ?? {}, "isra_1", locale);

  return (
    <section
      id="aqsa"
      style={{
        position: "relative",
        background: "linear-gradient(180deg, #FFFDF8 0%, #FBF6EC 100%)",
        borderTop: "1px solid rgba(211,154,39,.35)",
        borderBottom: "1px solid rgba(211,154,39,.35)",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        data-aqsa-pattern=""
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url('/minbar/assets/patterns/aqsa-white-pattern.webp')",
          backgroundRepeat: "repeat",
          backgroundSize: "300px 300px",
          opacity: 0.05,
          pointerEvents: "none",
        }}
      />
      {/* A thin gold rule at each end, framing the verse rather than underlining it. */}
      <span aria-hidden="true" style={{ position: "absolute", insetBlock: 0, insetInlineStart: 0, width: 3, background: "linear-gradient(180deg, var(--gold), rgba(211,154,39,.2))" }} />
      <span aria-hidden="true" style={{ position: "absolute", insetBlock: 0, insetInlineEnd: 0, width: 3, background: "linear-gradient(0deg, var(--gold), rgba(211,154,39,.2))" }} />

      <div id="verse-inner" style={{ position: "relative", maxWidth: 980, margin: "0 auto", padding: "26px 24px 22px", display: "grid", justifyItems: "center", gap: 12 }}>
        <span aria-hidden="true" style={{ width: 44, height: 3, borderRadius: 2, background: "linear-gradient(90deg, rgba(211,154,39,.25), var(--gold), rgba(211,154,39,.25))" }} />
        {/* Always RTL and always in the Qur'anic face, whatever the page language. */}
        <p
          dir="rtl"
          style={{
            margin: 0,
            textAlign: "center",
            fontFamily: "var(--font-quran)",
            fontSize: "clamp(19px, 2.4vw, 30px)",
            lineHeight: 1.95,
            color: "#7C2318",
            fontWeight: 700,
            textWrap: "balance",
          }}
        >
          {verse.arabic}
        </p>
        {verse.translation ? (
          <p style={{ margin: 0, textAlign: "center", fontSize: "clamp(13px, 1.2vw, 15.5px)", lineHeight: 1.85, color: "#3E4C55", maxWidth: 720, textWrap: "pretty" }}>
            {verse.translation}
          </p>
        ) : null}
        <div id="verse-meta" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            dir="rtl"
            style={{ unicodeBidi: "isolate", display: "inline-flex", alignItems: "center", height: 30, padding: "0 14px", borderRadius: 999, background: "rgba(211,154,39,.14)", border: "1px solid rgba(211,154,39,.45)", color: "#8a5d16", fontFamily: "var(--font-ar)", fontSize: 11.5, fontWeight: 900, whiteSpace: "nowrap" }}
          >
            {verse.label || t("verseCitation")}
          </span>
          {verse.attribution ? (
            <span style={{ fontSize: 10.5, color: "#52616B", opacity: 0.85 }}>{verse.attribution}</span>
          ) : null}
          <Link href={miaPath("aqsa", locale)} className="mia-pill-link" style={pillLink}>
            {t("aqsaPage")}
            <ArrowGlyph />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Story rail ──────────────────────────────────────────────────────────────
 * Data-driven from the CMS (`/api/stories`), opening into the full-screen
 * viewer the way Instagram does. The hand-written list below is the fallback
 * for when no story is live — it keeps the rail from vanishing on an empty
 * database, and those entries stay plain links.
 *
 * Titles and captions arrive already in this locale, and every CTA arrives
 * already resolved to an href for it; the rail only renders. A story's ring is
 * gold until it has been opened once, tracked per browser. */
const SEEN_KEY = "mia_stories_seen";

function readSeen(): Set<string> {
  try { return new Set(JSON.parse(window.localStorage.getItem(SEEN_KEY) || "[]") as string[]); } catch { return new Set(); }
}

export function StoriesRail() {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const tNav = useTranslations("navigation");
  const tCommon = useTranslations("common");
  const dir = (LOCALES as Record<string, { direction?: "rtl" | "ltr" }>)[locale]?.direction ?? "rtl";

  const [cms, setCms] = useState<PublicStory[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let live = true;
    setSeen(readSeen());
    fetch(`/api/stories?locale=${encodeURIComponent(locale)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { if (live) setCms(Array.isArray(d?.items) ? d.items : []); })
      .catch(() => { if (live) setCms([]); });
    return () => { live = false; };
  }, [locale]);

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try { window.localStorage.setItem(SEEN_KEY, JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });
  }, []);

  const fallback = [
    { label: t("storyGaza"), image: IMG.parcels, href: `${miaPath("projects", locale)}#gaza` },
    { label: t("regionAqsa"), image: IMG.aqsa, href: miaPath("aqsa", locale) },
    { label: t("storyFriday"), image: IMG.meals, href: miaPath("recurring", locale) },
    { label: tNav("waqf"), image: IMG.quds, href: miaPath("waqf", locale) },
    { label: tNav("zakat"), image: IMG.minber, href: miaPath("zakat", locale) },
    { label: t("storyReports"), image: IMG.redline, href: miaPath("reports", locale) },
    { label: t("storyField"), image: IMG.parcels, href: miaPath("about", locale) },
  ];

  const useCms = cms !== null && cms.length > 0;
  const entries = useCms
    ? cms.map((s, i) => ({ key: s.id, label: s.title, image: s.image, isNew: !seen.has(s.id), onOpen: () => setOpen(i) }))
    : fallback.map((f, i) => ({ key: f.href, label: f.label, image: f.image, isNew: i < 3, href: f.href }));

  return (
    <section style={{ position: "relative", zIndex: 1, background: "#FFFDF8", borderBottom: "1px solid var(--border)", padding: "16px 0", overflow: "hidden" }}>
      <div
        aria-hidden="true"
        data-aqsa-pattern=""
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url('/minbar/assets/patterns/aqsa-white-pattern.webp')",
          backgroundRepeat: "repeat",
          backgroundSize: "300px 300px",
          opacity: 0.05,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", padding: "0 18px" }}>
        <Rail step={474} prevLabel={t("storyPrev")} nextLabel={t("storyNext")} id="stories-rail">
          {entries.map((story) => {
            const inner = (
              <>
                <span
                  style={{
                    display: "block",
                    width: 84,
                    height: 84,
                    borderRadius: "50%",
                    padding: 3,
                    boxSizing: "border-box",
                    background: story.isNew
                      ? "conic-gradient(from 210deg, #A93428, #D39A27, #FFE8B0, #A93428)"
                      : "rgba(16,33,43,.16)",
                  }}
                >
                  <span style={{ position: "relative", display: "block", width: "100%", height: "100%", borderRadius: "50%", background: "#fff", padding: 3, boxSizing: "border-box" }}>
                    <span
                      role="img"
                      aria-label={story.label}
                      style={{
                        display: "block",
                        width: "100%",
                        height: "100%",
                        borderRadius: "50%",
                        backgroundImage: `url('${story.image}')`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    />
                    {story.isNew ? (
                      <span
                        style={{
                          position: "absolute",
                          insetInlineEnd: -2,
                          bottom: 2,
                          padding: "2px 7px",
                          borderRadius: 999,
                          background: "var(--red)",
                          color: "#fff",
                          fontSize: 9.5,
                          fontWeight: 900,
                          border: "2px solid var(--ivory)",
                        }}
                      >
                        {tCommon("newBadge")}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 800,
                    lineHeight: 1.35,
                    color: story.isNew ? "var(--deep)" : "var(--muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 96,
                    display: "block",
                  }}
                >
                  {story.label}
                </span>
              </>
            );
            const itemStyle: React.CSSProperties = { flex: "0 0 auto", display: "grid", gap: 8, justifyItems: "center", width: 96, textAlign: "center" };
            return "href" in story ? (
              <Link key={story.key} href={story.href!} style={itemStyle}>{inner}</Link>
            ) : (
              /* A button, not a link: nothing navigates. The viewer opens in place. */
              <button key={story.key} type="button" onClick={story.onOpen} style={{ ...itemStyle, background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit" }}>
                {inner}
              </button>
            );
          })}
        </Rail>
      </div>

      {useCms && open !== null ? (
        <StoryViewer
          stories={cms!}
          startIndex={open}
          onClose={() => setOpen(null)}
          onStorySeen={markSeen}
          dir={dir}
          labels={{ close: tCommon("close"), next: tCommon("next"), prev: tCommon("prev"), defaultCta: tCommon("readMore") }}
        />
      ) : null}
    </section>
  );
}

/* ── Hero ────────────────────────────────────────────────────────────────────
 * The landing section: headline, lead, the three actions, two proof figures,
 * and the intro film.
 *
 * The intro film is a different recording per language edition, so the play
 * action resolves the id from the locale rather than subtitling one cut — and
 * the poster is the film's own frame at 0:03, captured per edition and served
 * from public/minbar/assets/hero/, rather than YouTube's auto-thumbnail or an
 * unrelated photograph. A poster that IS the film is the honest preview.
 *
 * Layered background: an ivory base, two soft gold glows placed toward the
 * film, the Aqsa pattern at its quietest, and the dome line faint at the end
 * edge. The card sits on a gradient hairline and a second offset outline, so
 * it reads as an object with depth rather than a flat rectangle. Entrance
 * motion is a single fade-up per column and respects reduced-motion. */

/** The 0:03 frame of the intro film for this edition. */
export function heroPoster(locale: string): string {
  if (locale === "ar") return "/minbar/assets/hero/intro-ar.webp";
  if (locale === "tr") return "/minbar/assets/hero/intro-tr.webp";
  return "/minbar/assets/hero/intro-intl.webp";
}

/** Headline figures from the achievements record, formatted for the locale. */
function HeroStat({ value, label }: { value: number; label: string }) {
  const locale = useLocale();
  const { ref, value: shown } = useMinbarCountUp(value, 1600);
  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} style={{ display: "grid", gap: 3, minWidth: 0 }}>
      <b dir="ltr" style={{ fontSize: "clamp(24px, 2.4vw, 34px)", lineHeight: 1, fontWeight: 900, color: "var(--deep)", letterSpacing: "-.01em", fontVariantNumeric: "tabular-nums" }}>
        {new Intl.NumberFormat(locale).format(shown)}
        <span style={{ color: "var(--gold)" }}>+</span>
      </b>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

export function Hero({ onPlayIntro }: { onPlayIntro: (embed: string) => void }) {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const tCommon = useTranslations("common");
  const tNav = useTranslations("navigation");
  const tAch = useTranslations("achievements");
  const poster = heroPoster(locale);

  return (
    <section id="hero" className="mia-hero" style={{ position: "relative", zIndex: 1, overflow: "hidden", background: "var(--ivory)" }}>
      {/* Background layers — all non-interactive, all beneath the content. */}
      <div aria-hidden="true" className="mia-hero-glow" />
      <div
        aria-hidden="true"
        data-aqsa-pattern=""
        style={{ position: "absolute", inset: 0, backgroundImage: "url('/minbar/assets/patterns/aqsa-white-pattern.webp')", backgroundRepeat: "repeat", backgroundSize: "420px 420px", pointerEvents: "none" }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative asset in /public */}
      <img aria-hidden="true" src="/minbar/assets/aqsa-dome-line.png" alt="" className="mia-hero-dome" />
      <span aria-hidden="true" style={{ position: "absolute", top: 0, insetInline: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(211,154,39,.55), transparent)" }} />

      <div
        id="hero-main"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 1240,
          margin: "0 auto",
          padding: "68px 24px 96px",
          display: "grid",
          gridTemplateColumns: "minmax(320px,1.05fr) minmax(340px,1fr)",
          gap: 56,
          alignItems: "center",
        }}
      >
        {/* ── Copy ─────────────────────────────────────────────────────── */}
        <div className="mia-hero-copy" style={{ display: "grid", gap: 22, justifyItems: "start", minWidth: 0 }}>
          <span className="mia-hero-eyebrow">
            <span aria-hidden="true" className="mia-hero-eyebrow-dot" />
            {tCommon("orgOfficialName")}
          </span>

          <h1 style={{ margin: 0, maxWidth: "100%", display: "grid", gap: 8, fontSize: "clamp(32px, 3.6vw, 58px)", lineHeight: 1.18, fontWeight: 900, color: "var(--deep)", letterSpacing: "-.015em", textWrap: "balance" }}>
            <span>{t("heroTitle")}</span>
            <span className="mia-hero-sub" style={{ fontSize: "clamp(20px, 2.1vw, 34px)", fontWeight: 900, lineHeight: 1.3 }}>
              {t("heroSubtitle")}
            </span>
          </h1>

          <p style={{ margin: 0, maxWidth: "50ch", fontSize: "clamp(15.5px, 1.15vw, 17.5px)", lineHeight: 1.95, color: "var(--muted)", textWrap: "pretty" }}>{t("heroLead")}</p>

          <div className="mia-hero-actions" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
            <Button variant="primary" size="lg" href="#quick" style={{ whiteSpace: "nowrap", paddingInline: 30 }}>
              {t("heroCtaPrimary")}
              <ArrowGlyph size={14} />
            </Button>
            <Button variant="gold" size="lg" href={miaPath("zakatCalculator", locale)} style={{ whiteSpace: "nowrap" }}>
              {tCommon("zakatCalculator")}
            </Button>
            <Link href={miaPath("reports", locale)} className="mia-hero-textlink">
              {tNav("reports")}
              <ArrowGlyph size={13} />
            </Link>
          </div>

          {/* Proof row: the two headline figures the reports page opens with. */}
          <div className="mia-hero-proof">
            {BIG_STATS.map((s, i) => (
              <div key={s.labelKey} style={{ display: "contents" }}>
                {i > 0 ? <span aria-hidden="true" className="mia-hero-proof-rule" /> : null}
                <HeroStat value={s.count} label={tAch(s.labelKey)} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Film ─────────────────────────────────────────────────────── */}
        <div className="mia-hero-media" style={{ position: "relative", display: "grid", minWidth: 0 }}>
          <span aria-hidden="true" className="mia-hero-media-back" />
          <div className="mia-hero-frame">
            <button
              type="button"
              className="mia-hero-card"
              onClick={() => onPlayIntro(youtubeEmbed(introVideoId(locale), { autoplay: true }))}
              aria-label={t("videoTitle")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- the poster is a local, per-edition frame */}
              <img src={poster} alt={t("videoAlt")} className="mia-hero-poster" width={1280} height={720} decoding="async" fetchPriority="high" />
              <span aria-hidden="true" className="mia-hero-shade" />

              <span className="mia-hero-chip">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>
                {t("watch")}
              </span>

              <span aria-hidden="true" className="mia-hero-play">
                <span className="mia-hero-play-ring" />
                <span className="mia-hero-play-ring mia-hero-play-ring--2" />
                <span className="mia-hero-play-btn">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>
                </span>
              </span>

              <span className="mia-hero-caption">
                <b style={{ color: "#fff", fontSize: "clamp(17px, 1.5vw, 21px)", lineHeight: 1.35, textShadow: "0 1px 10px rgba(0,0,0,.35)" }}>{t("videoTitle")}</b>
                <span style={{ color: "rgba(255,255,255,.78)", fontSize: 12.5, fontWeight: 700 }}>{t("videoCaption")}</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

const pillLink: React.CSSProperties = {
  flex: "0 0 auto",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  height: 30,
  padding: "0 16px",
  borderRadius: 999,
  border: "1px solid rgba(211,154,39,.55)",
  background: "#fff",
  color: "var(--deep)",
  fontWeight: 800,
  fontSize: 12,
  whiteSpace: "nowrap",
  transition: "all .18s ease",
};

/** "Continue" arrow — mirrors with reading direction. */
export function ArrowGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mia-arrow-next"
    >
      <path d="M14 6l-6 6 6 6" />
    </svg>
  );
}
