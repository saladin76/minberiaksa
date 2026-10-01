"use client";

import { useCallback, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "react-hot-toast";
import { miaPath } from "@/lib/minbar/routes";
import { addToCart, type CartFreqKey } from "@/lib/minbar/cart";
import { flyToCart } from "@/lib/minbar/cart-feedback";
import GiveFrequencyDialog, { type GiveIntent } from "@/components/minbar/GiveFrequencyDialog";
import type { MinbarProject } from "@/lib/minbar/projects";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import { shareProgress, useShareWording } from "@/hooks/useShareWording";
import { useProjectPricing } from "@/hooks/useProjectPricing";
import { useDonationAmount } from "@/hooks/useDonationAmount";

/**
 * The site's project card  a full-bleed field photograph under a dark scrim,
 * with the region tag, the funding bar, quick amounts, and the donate / basket /
 * share row. Ported from `projectCards()` in
 * `Minbar/الصفحة الرئيسية.dc.html`; the same card is used on the projects,
 * Al-Quds and Al-Aqsa pages.
 *
 * Only identifiers reach the cart  `projectId` plus a numeric amount and an
 * ISO currency code  because the cart resolves titles live from the active
 * locale (`DEVELOPER_HANDOFF` § Cart Localization).
 *
 * The progress bar and figures are hidden entirely when a project has no fixed
 * goal, rather than drawn against a number that means nothing.
 *
 * A سهوم (shares) campaign shows its share price, and its chips are share
 * counts: the row added to the basket is count × price and carries the count.
 *
 * The whole card opens the campaign (a stretched link under the controls).
 * No amount is picked up front: "donate" without one shakes the chips and asks
 * for it. With an amount, the donor picks how the gift should continue
 * (`GiveFrequencyDialog`, the campaign's recommended cadence preselected) and
 * then donates now (to the basket page) or adds to the basket (stays here,
 * with a toast and a coin flying to the header).
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
  const router = useRouter();
  const t = useTranslations("common");
  const tGive = useTranslations("CardGive");
  const { format, formatNumber } = useMinbarMoney();
  const { fromLocal, fromChip, labelOf, tooSmall, minLabel } = useDonationAmount();
  const shares = project.shares;
  const { t: tShares, unitWord, countLabel } = useShareWording(shares);

  const { chips: amountChips, sharePrice } = useProjectPricing(project, QUICK_AMOUNTS);

  /* A shares card offers share counts; four chips fit the row like the
     amounts do. Amount chips carry USD with a label that may be an admin's
     figure in the visitor's currency; picked by position. */
  const options = shares
    ? shares.counts.slice(0, 4).map((count) => ({ value: count, label: countLabel(count, formatNumber(count)) }))
    : amountChips.map((c) => ({ value: c.usd, label: c.label }));

  const [picked, setPicked] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  /* Bumped on each attempt without an amount; keys the chip row so the shake
     replays every time. */
  const [nudge, setNudge] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  const href = miaPath("projectDetail", locale, project.slug);
  const chosen = custom ? Number(custom) : picked != null ? options[picked]?.value ?? 0 : 0;
  const shareCount = shares && Number.isInteger(chosen) && chosen > 0 ? chosen : 0;
  /* What the donor is giving: a typed figure is in their own currency, and an
     admin's per-currency chip or share price is kept exactly, so 1 TL stays
     1 TL. `amount` is its USD value, which the basket stores. */
  const given = shares
    ? fromChip(sharePrice, shareCount)
    : custom
      ? fromLocal(Number(custom))
      : picked != null
        ? fromChip(amountChips[picked])
        : { usd: 0 };
  const amount = given.usd;
  const amountLabel = labelOf(given);
  const hasFinancials = project.goal != null && project.goal > 0;
  const pct = hasFinancials ? Math.min((project.raised / (project.goal as number)) * 100, 100) : 0;
  const progress = shares ? shareProgress(shares, project.raised, hasFinancials ? project.goal : null) : null;

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

  /* Nothing picked, or (with the $1 floor on) less than the floor. */
  const belowMinimum = amount > 0 && tooSmall(amount, given.local);
  const missingAmount = nudge > 0 && (!(amount > 0) || belowMinimum);

  const openDialog = () => {
    if (!(amount > 0) || belowMinimum) {
      setNudge((n) => n + 1);
      return;
    }
    setDialogOpen(true);
  };

  const closeDialog = useCallback(() => setDialogOpen(false), []);

  const onConfirm = (freq: CartFreqKey, intent: GiveIntent, origin: HTMLElement) => {
    const from = origin.getBoundingClientRect();
    addToCart({
      projectId: project.slug,
      title: project.title,
      typeKey: "project",
      freqKey: freq,
      amount,
      currency: "USD",
      ...(given.local ? { local: given.local } : {}),
      ...(shareCount ? { shareCount } : {}),
    });
    setDialogOpen(false);

    if (intent === "donate") {
      router.push(miaPath("cart", locale));
      return;
    }

    flyToCart(from);
    const cadence = freq === "once" ? null : t(freq === "friday" ? "everyFriday" : freq);
    toast.custom(
      (toastState) => (
        <div className={`fq-toast${toastState.visible ? "" : " fq-toast--out"}`} role="status">
          <span className="fq-toast-check" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <span className="fq-toast-text">
            <b>{tGive("toastTitle")}</b>
            <small>
              {project.title} · <span dir="ltr">{amountLabel}</span>
              {cadence ? ` · ${cadence}` : ""}
            </small>
          </span>
          <Link href={miaPath("cart", locale)} className="fq-toast-cta" onClick={() => toast.dismiss(toastState.id)}>
            {tGive("toastCta")}
          </Link>
        </div>
      ),
      { duration: 5000 }
    );
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
      className="pdc-card"
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

      {/* The whole card opens the campaign. Hidden from the keyboard and screen
          readers: the title link below is the accessible way in. */}
      <Link href={href} aria-hidden="true" tabIndex={-1} className="pdc-stretch" />

      <div className="pdc-body" style={{ position: "relative", zIndex: 2, marginTop: "auto", display: "grid", gap: 12, padding: 18 }}>
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
            {progress?.total != null ? (
              <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.72)" }}>
                {tShares("soldOfTotal", {
                  sold: formatNumber(progress.sold),
                  total: formatNumber(progress.total),
                  unit: unitWord(progress.total),
                })}
              </span>
            ) : null}
          </div>
        ) : progress && progress.sold > 0 ? (
          /* No target to draw a bar against, but the count given so far still
             tells the donor the campaign is moving. */
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "rgba(255,255,255,.78)" }}>
            {tShares("givenSoFar", { count: formatNumber(progress.sold), unit: unitWord(progress.sold) })}
          </span>
        ) : null}

        {shares ? (
          <span style={{ justifySelf: "start", padding: "5px 12px", borderRadius: 999, background: "rgba(211,154,39,.2)", border: "1px solid rgba(211,154,39,.55)", color: "#fff", fontSize: 12.5, fontWeight: 900 }}>
            {tShares("pricePer", { price: sharePrice?.label ?? format(shares.priceUSD), unit: unitWord(1) })}
          </span>
        ) : null}

        <div key={nudge} className={missingAmount ? "pdc-shake" : undefined} style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {options.map((option, index) => (
            <button
              key={index}
              type="button"
              data-amt={picked === index && !custom ? "card" : ""}
              onClick={() => {
                setPicked(index);
                setCustom("");
              }}
              style={chipStyle(picked === index && !custom)}
            >
              {shares ? (
                option.label
              ) : (
                <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
                  {option.label}
                </span>
              )}
            </button>
          ))}
          <input
            value={custom}
            onChange={(e) => setCustom(shares ? e.target.value.replace(/[^0-9]/g, "").replace(/^0+/, "").slice(0, 6) : e.target.value.replace(/[^0-9]/g, ""))}
            inputMode={shares ? "numeric" : "decimal"}
            placeholder={shares ? tShares("customCountPh") : t("freeAmount")}
            aria-label={shares ? tShares("customCountPh") : t("freeAmount")}
            /* Takes the whole rest of the row. Capped at 14ch it left a ragged
               gap after the last chip on wide cards; growing into that space
               squares the row off and gives the translated labels (Montant
               libre / Freier Betrag) room they were being clipped for. The
               9ch floor keeps it usable when it wraps to a line of its own. */
            style={{
              flex: "1 1 9ch",
              minWidth: "9ch",
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
        {missingAmount ? (
          <span className="pdc-hint" role="alert">
            {belowMinimum ? tGive("minAmount", { amount: minLabel }) : shares ? tGive("pickCountFirst") : tGive("pickAmountFirst")}
          </span>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={openDialog}
            className="mia-card-cta"
            style={{
              flex: "1 1 auto",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 42,
              borderRadius: 999,
              border: 0,
              background: "var(--red)",
              color: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 900,
              transition: "filter .18s ease",
            }}
          >
            {t("donateNow")}
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

      <GiveFrequencyDialog
        open={dialogOpen}
        projectTitle={project.title}
        amountLabel={amountLabel}
        recommended={project.recommendedFrequency}
        onConfirm={onConfirm}
        onClose={closeDialog}
      />
    </div>
  );
}
