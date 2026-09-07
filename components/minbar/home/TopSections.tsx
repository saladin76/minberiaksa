"use client";

import Link from "next/link";
import { useLocale, useMessages, useTranslations } from "next-intl";
import { Button } from "@/components/minbar/ds";
import Rail from "@/components/minbar/Rail";
import { miaPath } from "@/lib/minbar/routes";
import { verseBlock } from "@/lib/minbar/quran";
import { IMG } from "@/lib/minbar/content/media";
import { introVideoId } from "@/lib/minbar/content/catalog";
import { youtubeEmbed } from "@/lib/minbar/content/media";

/**
 * The top of the homepage — ported from `Minbar/الصفحة الرئيسية.dc.html`:
 * the Qur'anic verse strip, the story rail, and the hero.
 */

/* ── Verse strip ─────────────────────────────────────────────────────────────
 * Al-Isra 1. The Arabic is shown in every language edition; the translation of
 * the meaning and its edition attribution appear beneath it in non-Arabic
 * sessions. See `lib/minbar/quran.ts` for why. */
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
        background: "#FFFDF8",
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
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          insetBlock: 0,
          insetInlineStart: 0,
          width: 3,
          background: "linear-gradient(180deg, var(--gold), rgba(211,154,39,.2))",
        }}
      />
      <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "14px 24px 12px", display: "grid", justifyItems: "center", gap: 9 }}>
        {/* Always RTL and always in the Qur'anic face, whatever the page language. */}
        <p
          dir="rtl"
          style={{
            margin: 0,
            minWidth: 0,
            textAlign: "center",
            fontFamily: "var(--font-quran)",
            fontSize: "clamp(15px,1.6vw,21px)",
            lineHeight: 1.85,
            color: "#7C2318",
            fontWeight: 700,
            whiteSpace: "nowrap",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {verse.arabic}
        </p>
        {verse.translation ? (
          <span style={{ textAlign: "center", fontSize: 13.5, lineHeight: 1.85, color: "#3E4C55", textWrap: "pretty", maxWidth: 720 }}>
            {verse.translation}
          </span>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "nowrap" }}>
          <span
            dir="rtl"
            style={{
              unicodeBidi: "isolate",
              display: "inline-flex",
              alignItems: "center",
              flex: "0 0 auto",
              height: 30,
              padding: "0 14px",
              borderRadius: 999,
              background: "rgba(211,154,39,.14)",
              border: "1px solid rgba(211,154,39,.45)",
              color: "#8a5d16",
              fontFamily: "var(--font-ar)",
              fontSize: 11.5,
              fontWeight: 900,
              whiteSpace: "nowrap",
            }}
          >
            {verse.label || t("verseCitation")}
          </span>
          {verse.attribution ? (
            <span style={{ flex: "0 1 auto", minWidth: 0, fontSize: 10.5, color: "#52616B", opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {verse.attribution}
            </span>
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
 * Labels are translated; the identity of each entry is its link, never the
 * label. Media is dashboard-managed. */
export function StoriesRail() {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const tNav = useTranslations("navigation");
  const tCommon = useTranslations("common");

  const stories = [
    { label: t("storyGaza"), image: IMG.parcels, href: `${miaPath("projects", locale)}#gaza` },
    { label: t("regionAqsa"), image: IMG.aqsa, href: miaPath("aqsa", locale) },
    { label: t("storyFriday"), image: IMG.meals, href: miaPath("recurring", locale) },
    { label: tNav("waqf"), image: IMG.quds, href: miaPath("waqf", locale) },
    { label: tNav("zakat"), image: IMG.minber, href: miaPath("zakat", locale) },
    { label: t("storyReports"), image: IMG.redline, href: miaPath("reports", locale) },
    { label: t("storyField"), image: IMG.parcels, href: miaPath("about", locale) },
  ];

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
          {stories.map((story, i) => {
            // The first three carry the gold "new" ring; the rest are muted.
            const isNew = i < 3;
            return (
              <Link key={story.href} href={story.href} style={{ flex: "0 0 auto", display: "grid", gap: 8, justifyItems: "center", width: 96, textAlign: "center" }}>
                <span
                  style={{
                    display: "block",
                    width: 84,
                    height: 84,
                    borderRadius: "50%",
                    padding: 3,
                    boxSizing: "border-box",
                    background: isNew
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
                    {isNew ? (
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
                    color: isNew ? "var(--deep)" : "var(--muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 96,
                    display: "block",
                  }}
                >
                  {story.label}
                </span>
              </Link>
            );
          })}
        </Rail>
      </div>
    </section>
  );
}

/* ── Hero ────────────────────────────────────────────────────────────────────
 * The intro film is a different recording per language edition, so the play
 * action resolves the id from the locale rather than subtitling one cut. */
export function Hero({ onPlayIntro }: { onPlayIntro: (embed: string) => void }) {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const tCommon = useTranslations("common");
  const tNav = useTranslations("navigation");

  return (
    <section style={{ position: "relative", zIndex: 1, background: "linear-gradient(to left, rgba(247,242,234,.08), rgba(247,242,234,.34))", overflow: "hidden" }}>
      <div
        id="hero-main"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 1240,
          margin: "0 auto",
          padding: "52px 24px 92px",
          display: "grid",
          gridTemplateColumns: "minmax(320px,1.15fr) minmax(340px,1fr)",
          gap: 40,
          alignItems: "center",
        }}
      >
        <div style={{ display: "grid", gap: 18, justifyItems: "start" }}>
          <h1 style={{ margin: 0, maxWidth: "100%", display: "grid", gap: 6, fontSize: "clamp(28px,3vw,48px)", lineHeight: 1.35, fontWeight: 900, color: "var(--deep)" }}>
            <span>{t("heroTitle")}</span>
            <span style={{ fontSize: "clamp(19px, 2.1vw, 34px)", fontWeight: 900, color: "var(--gold)", whiteSpace: "nowrap", maxWidth: "100%" }}>
              {t("heroSubtitle")}
            </span>
          </h1>
          <div style={{ width: 110, height: 2, background: "var(--gold)" }} />
          <p style={{ margin: 0, maxWidth: "48ch", fontSize: 16, lineHeight: 1.9, color: "var(--muted)" }}>{t("heroLead")}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
            <Button variant="primary" size="lg" href="#quick" style={{ whiteSpace: "nowrap" }}>
              {t("heroCtaPrimary")}
            </Button>
            <Button variant="support" size="lg" href={miaPath("zakatCalculator", locale)} style={{ whiteSpace: "nowrap" }}>
              {tCommon("zakatCalculator")}
            </Button>
            <Button variant="light" size="lg" href={miaPath("reports", locale)} style={{ whiteSpace: "nowrap" }}>
              {tNav("reports")}
            </Button>
          </div>
        </div>

        <div style={{ display: "grid" }}>
          <button
            type="button"
            onClick={() => onPlayIntro(youtubeEmbed(introVideoId(locale), { autoplay: true }))}
            aria-label={t("videoTitle")}
            style={{
              position: "relative",
              display: "block",
              aspectRatio: "4 / 3",
              borderRadius: 16,
              overflow: "hidden",
              background: "var(--deep)",
              boxShadow: "0 18px 44px rgba(16,33,43,.18)",
              cursor: "pointer",
              border: 0,
              padding: 0,
              width: "100%",
              textAlign: "start",
            }}
          >
            <img
              src="https://minberiaksa.org/uploads/video-kudus-minberi-aksa.png"
              alt={t("videoAlt")}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <span style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(16,33,43,.86), rgba(16,33,43,.08) 62%)" }} />
            <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
              <span style={{ display: "grid", placeItems: "center", width: 62, height: 62, borderRadius: "50%", background: "rgba(255,255,255,.94)", color: "var(--red)", boxShadow: "0 8px 24px rgba(0,0,0,.28)" }}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                </svg>
              </span>
            </span>
            <span style={{ position: "absolute", insetInlineStart: 18, bottom: 16, display: "grid", gap: 4 }}>
              <b style={{ color: "#fff", fontSize: 20, lineHeight: 1.35 }}>{t("videoTitle")}</b>
              <span style={{ color: "rgba(255,255,255,.75)", fontSize: 12.5, fontWeight: 700 }}>{t("videoCaption")}</span>
            </span>
          </button>
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
