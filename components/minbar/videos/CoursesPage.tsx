"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import { miaPath } from "@/lib/minbar/routes";
import { COURSES_FOR_HOME } from "@/lib/minbar/content/catalog";
import { youtubeEmbed } from "@/lib/minbar/content/media";
import VideoModal, { useVideoModal } from "@/components/minbar/VideoModal";

/**
 * Our courses — ported from `Minbar/دوراتنا.dc.html`.
 *
 * A course with a page of its own (the Zangi course) links to it; the rest are
 * full recordings and open in the overlay player, on a card that is still a
 * real anchor to the video so a copied link works.
 *
 * The handoff decides "course" vs "seminar" by testing whether the Arabic title
 * begins with "ندوة". That stops being true the moment the title is translated,
 * so the distinction is a field on the course instead.
 */
export default function CoursesPage() {
  const locale = useLocale();
  const rtl = localeDirection(locale) === "rtl";
  const t = useTranslations("homepage");
  const { embed, open, close } = useVideoModal();

  return (
    <div className="crs-page">
      <section style={{ position: "relative", background: "var(--deep)", overflow: "hidden" }}>
        <div aria-hidden="true" className="vg-pattern" />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "38px 24px 42px", display: "grid", gap: 10, justifyItems: "start" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(24px,2.6vw,36px)", lineHeight: 1.3, fontWeight: 900, color: "#fff" }}>
            {t("coursesTitle")}
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7, color: "rgba(255,255,255,.85)", maxWidth: "100%" }}>
            {t("coursesLead")}
          </p>
        </div>
      </section>

      <section style={{ position: "relative", padding: "52px 0 64px" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
          <div className="crs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 20 }}>
            {COURSES_FOR_HOME.map((course) => {
              const title = course.titleKey ? t(course.titleKey) : course.title;
              const internal = !course.external;
              /* Only the Zangi course has a page of its own so far; any other
                 internal course would need its own route before linking. */
              const href = internal
                ? miaPath("zenkiCourse", locale)
                : (course.href ?? "");

              const body = (
                <>
                  <span style={{ position: "relative", display: "block", width: "100%", aspectRatio: "16/9", background: "var(--navy)", overflow: "hidden" }}>
                    <span
                      role="img"
                      aria-label={title}
                      className="crs-cover"
                      style={{ position: "absolute", inset: 0, backgroundImage: `url('${course.cover}')`, backgroundSize: "cover", backgroundPosition: "center" }}
                    />
                    <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(2,34,34,.72), rgba(2,34,34,.1) 45%, transparent 65%)" }} />
                    <span aria-hidden="true" className="crs-play" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                      <span style={{ display: "grid", placeItems: "center", width: 52, height: 52, borderRadius: "50%", background: "rgba(255,253,248,.94)", color: "var(--red)", boxShadow: "0 12px 30px rgba(2,34,34,.35)" }}>
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </span>
                    <span style={{ position: "absolute", insetInlineStart: 14, top: 12, display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: 999, background: "rgba(2,34,34,.62)", border: "1px solid rgba(211,154,39,.6)", color: "#F2D9A4", fontSize: 11, fontWeight: 900, letterSpacing: ".04em", backdropFilter: "blur(3px)" }}>
                      {t(course.kind === "seminar" ? "kindSeminar" : "kindCourse")}
                    </span>
                    <span style={{ position: "absolute", insetInlineStart: 14, bottom: 12, display: "inline-flex", alignItems: "center", gap: 7, color: "#fff", fontSize: 11.5, fontWeight: 800, textShadow: "0 1px 6px rgba(2,34,34,.7)" }}>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="m10 8.5 5 3.5-5 3.5z" />
                      </svg>
                      {t(course.units ? "unitsCount" : "recordedVideo")}
                    </span>
                  </span>

                  <span style={{ display: "grid", gridTemplateRows: "auto 1fr auto", gap: 8, padding: "18px 20px 20px" }}>
                    <b style={{ fontSize: 15.5, fontWeight: 900, lineHeight: 1.65 }}>{title}</b>
                    {course.subtitleKey ? (
                      <span style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.85, alignSelf: "start" }}>
                        {t(course.subtitleKey)}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 6, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 9, color: "var(--red)", fontWeight: 900, fontSize: 13.5 }}>
                        {t(course.external ? "watchNow" : "courseDetails")}
                        <span aria-hidden="true" className="crs-arrow">{rtl ? "←" : "→"}</span>
                      </span>
                      <span aria-hidden="true" style={{ width: 26, height: 3, borderRadius: 2, background: `linear-gradient(to ${rtl ? "left" : "right"}, rgba(211,154,39,.25), var(--gold))` }} />
                    </span>
                  </span>
                </>
              );

              const frame = {
                display: "grid",
                gridTemplateRows: "auto 1fr",
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 14px 40px rgba(16,33,43,.08)",
                color: "var(--deep)",
              } as const;

              return internal ? (
                <Link key={course.slug} href={href} className="crs-card" style={frame}>
                  {body}
                </Link>
              ) : (
                <a
                  key={course.slug}
                  href={href}
                  className="crs-card"
                  style={frame}
                  onClick={(event) => {
                    if (!course.introVideoId) return;
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    open(youtubeEmbed(course.introVideoId, { autoplay: true }));
                  }}
                >
                  {body}
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <VideoModal embed={embed} onClose={close} />
    </div>
  );
}
