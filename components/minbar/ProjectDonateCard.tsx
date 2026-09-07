"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { addToCart } from "@/lib/minbar/cart";
import type { MinbarProject } from "@/lib/minbar/projects";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";

/**
 * The site's project card — a full-bleed field photograph under a dark scrim,
 * with the region tag, the funding bar, quick amounts, and the donate / basket /
 * share row. Ported from `projectCards()` in
 * `Minbar/الصفحة الرئيسية.dc.html`; the same card is used on the projects,
 * Al-Quds and Al-Aqsa pages.
 *
 * Only identifiers reach the cart — `projectId` plus a numeric amount and an
 * ISO currency code — because the cart resolves titles live from the active
 * locale (`DEVELOPER_HANDOFF` § Cart Localization).
 *
 * The progress bar and figures are hidden entirely when a project has no fixed
 * goal, rather than drawn against a number that means nothing.
 */

const QUICK_AMOUNTS = [100, 300, 500, 700];

export interface ProjectDonateCardProps {
  project: MinbarProject;
  /** Fixed track width for rail layouts; omit inside a grid. */
  width?: number;
  /** Region / category chip. Defaults to the project's own region label. */
  tag?: string;
}

export default function ProjectDonateCard({ project, width, tag }: ProjectDonateCardProps) {
  const locale = useLocale();
  const t = useTranslations("common");
  const { format } = useMinbarMoney();

  const [picked, setPicked] = useState<number>(QUICK_AMOUNTS[0]);
  const [custom, setCustom] = useState("");
  const [added, setAdded] = useState(false);

  const href = miaPath("projectDetail", locale, project.slug);
  const amount = custom ? Number(custom) : picked;
  const hasFinancials = project.goal != null && project.goal > 0;
  const pct = hasFinancials ? Math.min((project.raised / (project.goal as number)) * 100, 100) : 0;
  const amounts = project.suggestedAmounts?.length ? project.suggestedAmounts : QUICK_AMOUNTS;

  const chipStyle = (active: boolean): CSSProperties => ({
    height: 34,
    padding: "0 13px",
    borderRadius: 999,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 800,
    whiteSpace: "nowrap",
    transition: "all .18s ease",
    border: `1px solid ${active ? "var(--gold)" : "rgba(255,255,255,.32)"}`,
    background: active ? "var(--gold)" : "rgba(255,255,255,.1)",
    color: "#fff",
  });

  const onAddToBasket = () => {
    if (!(amount > 0)) return;
    addToCart({
      projectId: project.slug,
      title: project.title,
      typeKey: "project",
      freqKey: "once",
      amount,
      currency: "USD",
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2400);
  };

  const onShare = async () => {
    const url = `${window.location.origin}${href}`;
    if (navigator.share) {
      // A cancelled share rejects; that is a user action, not an error.
      await navigator.share({ title: project.title, url }).catch(() => {});
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url).catch(() => {});
    }
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minHeight: 430,
        flex: width ? `0 0 ${width}px` : undefined,
        borderRadius: 16,
        overflow: "hidden",
        background: "var(--deep)",
        border: "1px solid var(--border)",
        boxShadow: "0 1px 2px rgba(16,33,43,.04)",
        transition: "transform .22s ease, box-shadow .22s ease",
      }}
    >
      {project.image ? (
        <span
          role="img"
          aria-label={project.title}
          style={{
            position: "absolute",
            inset: 0,
            display: "block",
            backgroundImage: `url('${project.image}')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ) : null}
      <span
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(0deg, rgba(16,33,43,.96) 26%, rgba(16,33,43,.72) 52%, rgba(16,33,43,.18) 82%)",
          pointerEvents: "none",
        }}
      />
      {tag || project.regionLabel ? (
        <span
          style={{
            position: "absolute",
            insetInlineStart: 14,
            top: 14,
            padding: "5px 11px",
            borderRadius: 999,
            background: "rgba(16,33,43,.72)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 900,
          }}
        >
          {tag ?? project.regionLabel}
        </span>
      ) : null}

      <div style={{ position: "relative", marginTop: "auto", display: "grid", gap: 12, padding: 18 }}>
        <Link href={href} style={{ display: "grid", gap: 7, color: "#fff" }}>
          <b style={{ fontSize: 19, lineHeight: 1.4, color: "#fff" }}>{project.title}</b>
        </Link>

        {hasFinancials ? (
          <div style={{ display: "grid", gap: 7 }}>
            <span style={{ display: "block", height: 4, borderRadius: 999, background: "rgba(255,255,255,.2)" }}>
              <span
                style={{
                  display: "block",
                  height: "100%",
                  borderRadius: 999,
                  width: `${pct}%`,
                  background: "linear-gradient(-90deg, var(--red), var(--gold))",
                }}
              />
            </span>
            <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "rgba(255,255,255,.72)" }}>
              <b dir="ltr" style={{ color: "#fff", unicodeBidi: "isolate" }}>
                {format(project.raised)}
              </b>
              <span dir="ltr" style={{ unicodeBidi: "isolate", display: "inline-block" }}>
                {t("goal")} {format(project.goal as number)}
              </span>
            </span>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {amounts.map((value) => (
            <button
              key={value}
              type="button"
              data-amt={picked === value && !custom ? "card" : ""}
              onClick={() => {
                setPicked(value);
                setCustom("");
              }}
              style={chipStyle(picked === value && !custom)}
            >
              <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
                {format(value)}
              </span>
            </button>
          ))}
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="decimal"
            placeholder={t("freeAmount")}
            aria-label={t("freeAmount")}
            /* No fixed width: sized to "Free amount" it clipped the translated
               label (Montant libre / Freier Betrag). It follows the content with
               a floor in ch instead. */
            style={{
              flex: "0 1 auto",
              width: "11ch",
              minWidth: "9ch",
              maxWidth: "14ch",
              height: 34,
              padding: "0 12px",
              borderRadius: 999,
              boxSizing: "border-box",
              border: `1px solid ${custom ? "var(--gold)" : "rgba(255,255,255,.32)"}`,
              background: "rgba(255,255,255,.1)",
              color: "#fff",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 800,
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            href={href}
            className="mia-card-cta"
            style={{
              flex: "1 1 auto",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 42,
              borderRadius: 999,
              background: "var(--red)",
              color: "#fff",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 900,
              transition: "filter .18s ease",
            }}
          >
            {t("donateNow")}
          </Link>
          <button
            type="button"
            data-icon-action=""
            onClick={onAddToBasket}
            title={t("addToCart")}
            aria-label={t("addToCart")}
            style={{
              flex: "0 0 auto",
              width: 42,
              height: 42,
              display: "grid",
              placeItems: "center",
              border: `1px solid ${added ? "var(--gold)" : "rgba(255,255,255,.34)"}`,
              borderRadius: 999,
              background: added ? "var(--gold)" : "rgba(255,255,255,.08)",
              color: "#fff",
              cursor: "pointer",
              transition: "all .18s ease",
            }}
          >
            {added ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m4 8 2 11h12l2-11H4Z" />
                <path d="m9 8 3-4 3 4M9 12v3M15 12v3" />
              </svg>
            )}
          </button>
          <button
            type="button"
            data-icon-action=""
            onClick={onShare}
            title={t("share")}
            aria-label={t("share")}
            style={{
              flex: "0 0 auto",
              width: 42,
              height: 42,
              display: "grid",
              placeItems: "center",
              border: "1px solid rgba(255,255,255,.34)",
              borderRadius: 999,
              background: "rgba(255,255,255,.08)",
              color: "#fff",
              cursor: "pointer",
              transition: "all .18s ease",
            }}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
