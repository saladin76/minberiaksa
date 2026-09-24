"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LOCALES } from "@/lib/locales";
import StoryViewer, { type PublicStory } from "./StoryViewer";
import { useLocale, useMessages, useTranslations } from "next-intl";
import { Button } from "@/components/minbar/ds";
import { miaPath } from "@/lib/minbar/routes";
import { verseBlock } from "@/lib/minbar/quran";
import { IMG } from "@/lib/minbar/content/media";
import { introVideoId } from "@/lib/minbar/content/catalog";
import { BIG_STATS } from "@/lib/minbar/achievements";
import { useMinbarCountUp } from "@/hooks/useMinbarReveal";
import { youtubeEmbed } from "@/lib/minbar/content/media";

/**
 * The top of the homepage — ported from `Minbar/الصفحة الرئيسية.dc.html`:
 * the landing section (with the story strip inside it) and the Qur'anic verse
 * band beneath.
 */

/* ── Verse band ──────────────────────────────────────────────────────────────
 * Al-Isra 1, directly under the landing — the verse the whole site stands on.
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
    <section id="aqsa" className="mia-verse">
      <div aria-hidden="true" data-aqsa-pattern="" className="mia-verse-pattern" />
      <div id="verse-inner" className="mia-verse-inner">
        {/* Always RTL and always in the Qur'anic face, whatever the page language. */}
        <p dir="rtl" className="mia-verse-ar">
          {verse.arabic}
        </p>
        {verse.translation ? <p className="mia-verse-tr">{verse.translation}</p> : null}
        <div id="verse-meta" className="mia-verse-meta">
          <span dir="rtl" className="mia-verse-cite">{verse.label || t("verseCitation")}</span>
          {verse.attribution ? <span className="mia-verse-attr">{verse.attribution}</span> : null}
          <Link href={miaPath("aqsa", locale)} className="mia-pill-link mia-verse-link">
            {t("aqsaPage")}
            <ArrowGlyph />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Story strip ─────────────────────────────────────────────────────────────
 * The first row of the landing section, data-driven from the CMS
 * (`/api/stories`) and opening into the full-screen viewer the way Instagram
 * does. The hand-written list below is the fallback for when no story is live
 * — it keeps the strip from vanishing on an empty database, and those entries
 * stay plain links.
 *
 * Titles and captions arrive already in this locale, and every CTA arrives
 * already resolved to an href for it; the strip only renders. A story's ring
 * is gold until it has been opened once, tracked per browser.
 *
 * It used to be its own white band above the hero, centred, with 84px rings —
 * a third of a screen before the headline. It is now the top row of the hero
 * itself: start-aligned, 62px rings, sharing the hero's ground, with a
 * hairline under it. */

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
  const [overflow, setOverflow] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let live = true;
    setSeen(readSeen());
    fetch(`/api/stories?locale=${encodeURIComponent(locale)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { if (live) setCms(Array.isArray(d?.items) ? d.items : []); })
      .catch(() => { if (live) setCms([]); });
    return () => { live = false; };
  }, [locale]);

  /* Arrows only when the strip actually overflows its row. */
  useEffect(() => {
    const el = railRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cms]);

  const nudge = (direction: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    const sign = dir === "rtl" ? -1 : 1;
    el.scrollBy({ left: sign * direction * Math.max(240, el.clientWidth * 0.6), behavior: "smooth" });
  };

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

  const arrow = (direction: 1 | -1, label: string) => (
    <button type="button" className="mia-stories-arrow" onClick={() => nudge(direction)} aria-label={label} data-dir={direction === 1 ? "next" : "prev"}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 6l-6 6 6 6" />
      </svg>
    </button>
  );

  return (
    <div className="mia-stories" data-overflow={overflow ? "true" : "false"}>
      <div className="mia-stories-rail" id="stories-rail" ref={railRef}>
        {entries.map((story) => {
          const inner = (
            <>
              <span className="mia-story-ring" data-new={story.isNew ? "true" : "false"}>
                <span className="mia-story-disc">
                  <span role="img" aria-label={story.label} className="mia-story-img" style={{ backgroundImage: `url('${story.image}')` }} />
                </span>
                {story.isNew ? <span className="mia-story-badge">{tCommon("newBadge")}</span> : null}
              </span>
              <span className="mia-story-label" data-new={story.isNew ? "true" : "false"}>{story.label}</span>
            </>
          );
          return "href" in story ? (
            <Link key={story.key} href={story.href!} className="mia-story">{inner}</Link>
          ) : (
            /* A button, not a link: nothing navigates. The viewer opens in place. */
            <button key={story.key} type="button" onClick={story.onOpen} className="mia-story">
              {inner}
            </button>
          );
        })}
      </div>
      <div className="mia-stories-nav">
        {arrow(-1, t("storyPrev"))}
        {arrow(1, t("storyNext"))}
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
    </div>
  );
}

/* ── Landing ─────────────────────────────────────────────────────────────────
 * One section, three rows: the story strip, the headline beside the intro
 * film, and a proof band across the bottom with the two headline figures and
 * the link to the reports they come from.
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

/**
 * The headline with one word set apart — Al-Quds, in whichever language —
 * by a hand-drawn gold stroke beneath it that draws itself in on load.
 *
 * The word is `homepage.heroTitleAccent`, a separate key per locale, because
 * the title is a sentence and where the city's name falls in it differs from
 * language to language. The stroke sits under exactly that substring and the
 * substring is kept on one line, so a wrap never cuts the stroke in half. If a
 * locale's accent is not found in its title the title renders plain — a
 * mismatch must never make the headline disappear.
 */
function AccentedTitle({ text, accent }: { text: string; accent: string }) {
  const at = accent ? text.indexOf(accent) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="mia-hero-accent">
        <span className="mia-hero-accent-word">{accent}</span>
        <svg className="mia-hero-accent-stroke" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true">
          <path d="M3 11 C 38 4, 82 3, 118 8 S 176 13, 197 7" pathLength="100" />
        </svg>
      </span>
      {text.slice(at + accent.length)}
    </>
  );
}

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
    <div ref={ref as React.RefObject<HTMLDivElement>} className="mia-hero-stat">
      <b>
        {new Intl.NumberFormat(locale).format(shown)}
        <span>+</span>
      </b>
      <span>{label}</span>
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
    <section id="hero" className="mia-hero">
      {/* Background layers — all non-interactive, all beneath the content. */}
      <div aria-hidden="true" className="mia-hero-glow" />
      <div aria-hidden="true" data-aqsa-pattern="" className="mia-hero-pattern" />
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative asset in /public */}
      <img aria-hidden="true" src="/minbar/assets/aqsa-dome-line.png" alt="" className="mia-hero-dome" />

      <div className="mia-hero-wrap">
        <StoriesRail />

        <div id="hero-main" className="mia-hero-main">
          {/* ── Copy ───────────────────────────────────────────────────── */}
          <div className="mia-hero-copy">

            {/* The title is the H1 on its own; the supporting line is a
                separate element, not part of the heading. Inside one H1 the
                two read as a single run of text to crawlers and screen
                readers — "…المرابطينحول المسجد…" (`DEPLOYED_VS_DESIGN_AUDIT.md`
                § P2.2). The classes are unchanged, so the layout is. */}
            <h1 className="mia-hero-h1">
              <span className="mia-hero-title">
                <AccentedTitle text={t("heroTitle")} accent={t("heroTitleAccent")} />
              </span>
            </h1>
            <p className="mia-hero-sub" style={{ margin: 0 }}>
              <span aria-hidden="true" className="mia-hero-sub-mark" />
              {t("heroSubtitle")}
            </p>

            <p className="mia-hero-lead">{t("heroLead")}</p>

            <div className="mia-hero-actions">
              <Button variant="primary" size="lg" href="#quick" className="mia-hero-btn">
                {t("heroCtaPrimary")}
                <ArrowGlyph size={14} />
              </Button>
              <Button variant="gold" size="lg" href={miaPath("zakatCalculator", locale)} className="mia-hero-btn">
                {tCommon("zakatCalculator")}
              </Button>
            </div>
          </div>

          {/* ── Film ───────────────────────────────────────────────────── */}
          <div className="mia-hero-media">
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
                  <b>{t("videoTitle")}</b>
                  <span>{t("videoCaption")}</span>
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Proof band: the two headline figures the reports page opens with. */}
        <div className="mia-hero-proof">
          {BIG_STATS.map((s, i) => (
            <div key={s.labelKey} style={{ display: "contents" }}>
              {i > 0 ? <span aria-hidden="true" className="mia-hero-proof-rule" /> : null}
              <HeroStat value={s.count} label={tAch(s.labelKey)} />
            </div>
          ))}
          <Link href={miaPath("reports", locale)} className="mia-hero-textlink">
            {tNav("reports")}
            <ArrowGlyph size={13} />
          </Link>
        </div>
      </div>
    </section>
  );
}

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
