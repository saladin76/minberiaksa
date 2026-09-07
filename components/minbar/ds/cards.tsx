import type { CSSProperties, ReactNode } from "react";
import Badge from "./Badge";
import Button from "./Button";

/**
 * Card primitives ported from the design-system bundle
 * (`Minbar/_ds/<ds>/_ds_bundle.js` → `components/cards/*.jsx`).
 *
 * The bundle's copy was English placeholder text baked into the component
 * ("Give Now", "Raised", "Official Minber"). Everything user-facing is a prop
 * here instead, because the site renders in 19 languages and
 * `DEVELOPER_HANDOFF §9` forbids assembling sentences in code.
 */

/* ── CertificateCard ─────────────────────────────────────────────────────────
 * Certificate / receipt preview — an official, warm ivory surface with a faint
 * 45° gold ornament wash. Carries the mark, a document label and a reference
 * note. Used in the Certificates / Proof section and the wallet. */
export interface CertificateCardProps {
  label: ReactNode;
  holder?: ReactNode;
  note?: ReactNode;
  logo?: string;
  style?: CSSProperties;
}

export function CertificateCard({ label, holder, note, logo, style }: CertificateCardProps) {
  return (
    <div
      style={{
        display: "grid",
        alignContent: "center",
        gap: 12,
        minHeight: 190,
        padding: 24,
        borderRadius: "var(--r)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow)",
        background:
          "linear-gradient(135deg, rgba(255,253,248,.98), rgba(247,242,234,.94))," +
          "repeating-linear-gradient(45deg, transparent 0 10px, rgba(211,154,39,.08) 10px 11px)",
        ...style,
      }}
    >
      {logo ? <img src={logo} alt="" style={{ height: 34, width: "auto", objectFit: "contain" }} /> : null}
      <span style={{ color: "var(--muted)", fontWeight: 800, fontSize: 13 }}>{label}</span>
      <b style={{ fontSize: 20, color: "var(--deep)" }}>{holder}</b>
      {note ? <small style={{ color: "var(--muted)" }}>{note}</small> : null}
    </div>
  );
}

/* ── FundCard ────────────────────────────────────────────────────────────────
 * Compact tile for an ongoing fund (Gaza Emergency, Al-Quds Waqf, Zakat…).
 * Content sits at the bottom. On dark surfaces pass tone="dark". */
export interface FundCardProps {
  title: ReactNode;
  note?: ReactNode;
  href?: string;
  tone?: "light" | "dark";
  style?: CSSProperties;
}

export function FundCard({ title, note, href = "#", tone = "light", style }: FundCardProps) {
  const dark = tone === "dark";
  return (
    <a
      href={href}
      style={{
        display: "grid",
        alignContent: "end",
        gap: 6,
        minHeight: 132,
        padding: 24,
        borderRadius: "var(--r)",
        border: `1px solid ${dark ? "rgba(255,255,255,.18)" : "var(--border)"}`,
        background: dark ? "rgba(255,255,255,.08)" : "#fff",
        boxShadow: dark ? "none" : "var(--shadow)",
        color: dark ? "#fff" : "var(--deep)",
        ...style,
      }}
    >
      <b style={{ fontSize: 18, lineHeight: 1.2 }}>{title}</b>
      {note ? <small style={{ color: dark ? "rgba(255,255,255,.7)" : "var(--muted)" }}>{note}</small> : null}
    </a>
  );
}

/* ── ProjectCard ─────────────────────────────────────────────────────────────
 * The core campaign card: real field image, category + "Official Minber" tag,
 * short title/description, a red→gold progress bar and a raised/goal/donors
 * metric row. Figures carry a "to be verified" note until confirmed — the brand
 * never invents impact numbers. */
export interface ProjectCardProps {
  image?: string;
  category?: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  raised?: number;
  goal?: number | null;
  donors?: ReactNode;
  note?: ReactNode;
  href?: string;
  donateHref?: string;
  featured?: boolean;
  official?: boolean;
  /** Localised label for the "Official Minber" tag over the image. */
  officialLabel?: ReactNode;
  /** Localised metric captions — order is raised / goal / donors. */
  labels: { raised: ReactNode; goal: ReactNode; donors: ReactNode; donate: ReactNode; view: ReactNode };
  /** Formats a figure in the visitor's active currency. */
  formatAmount: (value: number) => string;
  style?: CSSProperties;
}

export function ProjectCard({
  image,
  category,
  title,
  text,
  raised = 0,
  goal,
  donors,
  note,
  href = "#",
  donateHref = "#",
  featured = false,
  official = true,
  officialLabel,
  labels,
  formatAmount,
  style,
}: ProjectCardProps) {
  const pct = goal ? Math.min((raised / goal) * 100, 100) : 0;

  const metric = (value: ReactNode, caption: ReactNode) => (
    <span style={{ display: "grid", color: "var(--muted)", fontSize: 12 }}>
      <b style={{ color: "var(--deep)", fontSize: 16 }}>{value}</b>
      {caption}
    </span>
  );

  return (
    <article
      style={{
        display: featured ? "grid" : "block",
        gridTemplateColumns: featured ? "minmax(0,.95fr) minmax(0,1.05fr)" : undefined,
        gridColumn: featured ? "span 2" : undefined,
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
        boxShadow: "var(--shadow)",
        overflow: "hidden",
        ...style,
      }}
    >
      <div style={{ position: "relative", minHeight: featured ? "100%" : 210, background: "var(--deep)" }}>
        {image ? (
          <img
            src={image}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", minHeight: featured ? 300 : 210 }}
          />
        ) : null}
        {official && officialLabel ? (
          <span style={{ position: "absolute", insetInlineStart: 14, top: 14 }}>
            <Badge tone="onImage">{officialLabel}</Badge>
          </span>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: 13, padding: 20, alignContent: "start" }}>
        {category ? (
          <p style={{ margin: 0, color: "var(--gold)", fontWeight: 900, fontSize: 13, textTransform: "uppercase" }}>
            {category}
          </p>
        ) : null}
        <h3 style={{ margin: 0, fontSize: 24, lineHeight: 1.15, color: "var(--deep)" }}>{title}</h3>
        {text ? <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.5 }}>{text}</p> : null}

        {goal != null ? (
          <>
            <div style={{ height: 9, borderRadius: 999, background: "#f1ded7", overflow: "hidden" }}>
              <span
                style={{
                  display: "block",
                  height: "100%",
                  width: `${pct}%`,
                  background: "linear-gradient(90deg, var(--red), var(--gold))",
                }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
              {metric(formatAmount(raised), labels.raised)}
              {metric(formatAmount(goal), labels.goal)}
              {metric(donors, labels.donors)}
            </div>
          </>
        ) : null}

        {note ? <small style={{ color: "var(--muted)" }}>{note}</small> : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 2 }}>
          <Button variant="primary" href={donateHref}>
            {labels.donate}
          </Button>
          <Button variant="light" href={href}>
            {labels.view}
          </Button>
        </div>
      </div>
    </article>
  );
}
