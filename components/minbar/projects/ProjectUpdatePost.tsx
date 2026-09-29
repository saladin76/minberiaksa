"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { MinbarProjectUpdate } from "@/lib/minbar/projects";
import ProjectVideo from "./ProjectVideo";

/**
 * One campaign update, shown the way a social post reads: the association as
 * the author, when it was posted, the text, and the photo or video from the
 * field. Long text is folded behind "read more" so a feed of updates stays
 * scannable.
 */

const FOLD_AT = 320;

export default function ProjectUpdatePost({ update, projectTitle }: { update: MinbarProjectUpdate; projectTitle: string }) {
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const tExtras = useTranslations("ProjectExtras");
  const [open, setOpen] = useState(false);

  const long = update.text.length > FOLD_AT;
  const text = long && !open ? `${update.text.slice(0, FOLD_AT).trimEnd()}…` : update.text;
  const posted = new Date(update.createdAt);
  const date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(posted);

  return (
    <article style={{ display: "grid", gap: 14, padding: 18, background: "#fff", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 1px 2px rgba(16,33,43,.04)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span
          aria-hidden="true"
          style={{ flex: "0 0 auto", width: 42, height: 42, borderRadius: "50%", border: "1px solid rgba(211,154,39,.45)", background: "#fff center/70% no-repeat url('/minbar/assets/logo-mark.png')" }}
        />
        <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14.5, lineHeight: 1.4 }}>{tCommon("orgOfficialName")}</b>
          <time dateTime={update.createdAt} style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>
            {date} · {tExtras("updateBadge")}
          </time>
        </span>
      </header>

      <div style={{ display: "grid", gap: 6 }}>
        {update.title ? <b style={{ fontSize: 16.5, lineHeight: 1.55 }}>{update.title}</b> : null}
        {update.text ? (
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.95, color: "var(--muted)", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
            {text}
            {long ? (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  style={{ border: 0, padding: 0, background: "none", color: "var(--deep)", fontFamily: "inherit", fontSize: 13.5, fontWeight: 900, cursor: "pointer" }}
                >
                  {open ? tExtras("showLess") : tExtras("readMore")}
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      {update.videoUrl ? (
        <ProjectVideo url={update.videoUrl} title={update.title || projectTitle} />
      ) : update.image ? (
        // A field photo at its own proportions, capped so a portrait shot does not take over the feed.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={update.image}
          alt={update.title || projectTitle}
          loading="lazy"
          style={{ display: "block", width: "100%", maxHeight: 520, objectFit: "cover", borderRadius: 12, border: "1px solid var(--border)", background: "var(--sand)" }}
        />
      ) : null}

      {update.videoUrl && update.image ? (
        // Both set: the video leads, the photo follows.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={update.image} alt="" loading="lazy" style={{ display: "block", width: "100%", maxHeight: 420, objectFit: "cover", borderRadius: 12, border: "1px solid var(--border)" }} />
      ) : null}
    </article>
  );
}
