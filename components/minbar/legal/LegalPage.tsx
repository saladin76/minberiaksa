"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";

/**
 * The shared layout of the five legal pages — terms, privacy, donation policy,
 * cookies, and the accessibility statement. Ported from
 * `Minbar/الشروط والأحكام.dc.html` and its four siblings, which share one
 * structure: a sticky table of contents beside a stack of icon-led sections.
 *
 * `LEGAL_REVIEW_REQUIRED`: the copy in every language is under human legal
 * review before launch. `DEVELOPER_HANDOFF §13` is explicit that translating a
 * legal text is not the same as approving it, and the translation-sync layer
 * only ever updates these as drafts.
 */

/** Section glyphs, drawn to match what each section is about. */
export const LEGAL_ICONS: Record<string, ReactElement> = {
  document: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  heart: <path d="M12 21s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 7.5 3c0 5.3-7.5 10-7.5 10Z" />,
  file: (
    <>
      <path d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M15 4v5h5" />
    </>
  ),
  refresh: (
    <>
      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" />
      <path d="M18 3v4h-4M6 21v-4h4" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  cookie: (
    <>
      <path d="M12 3a9 9 0 1 0 9 9 4 4 0 0 1-5-5 3.5 3.5 0 0 1-4-4Z" />
      <path d="M9 11h.01M13 15h.01M8.5 15.5h.01M14 10h.01" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="18" r="2" />
    </>
  ),
  accessibility: (
    <>
      <circle cx="12" cy="4.5" r="1.8" />
      <path d="M4.5 8.5c2.4.9 4.9 1.4 7.5 1.4s5.1-.5 7.5-1.4" />
      <path d="M12 9.9V15M12 15l-3 6M12 15l3 6" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  receipt: (
    <>
      <path d="M7 3h10l2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5l2-2Z" />
      <path d="M9 9h6M9 13h6" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M3 10h18M16 14h2" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M18 7v6a4 4 0 0 1-4 4H8" />
    </>
  ),
};

export interface LegalSection {
  /** Anchor id, used by the table of contents. */
  id: string;
  /** Key of the heading in the `legal` namespace. */
  headingKey: string;
  /** Key of the body copy in the `legal` namespace. */
  bodyKey: string;
  icon: keyof typeof LEGAL_ICONS;
}

export default function LegalPage({ titleKey, sections }: { titleKey: string; sections: readonly LegalSection[] }) {
  const t = useTranslations("legal");

  return (
    <section id="legal-grid" style={{ maxWidth: 1080, margin: "0 auto", padding: "56px 24px 80px", display: "grid", gridTemplateColumns: "minmax(0,220px) minmax(0,1fr)", gap: 48, alignItems: "start" }}>
      <nav aria-label={t("tocLabel")} className="legal-toc" style={{ position: "sticky", top: 122, flexDirection: "column", gap: 2 }}>
        {sections.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="legal-toc-link" style={{ display: "block", padding: "8px 0", fontSize: 13.5, fontWeight: 800, color: "var(--muted)", borderInlineStart: "2px solid transparent", paddingInlineStart: 10 }}>
            {t(section.headingKey)}
          </a>
        ))}
      </nav>

      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: "0 0 30px", fontSize: "clamp(26px,3vw,36px)", fontWeight: 900 }}>{t(titleKey)}</h1>
        <div style={{ display: "grid", gap: 22, fontSize: 16, lineHeight: 1.95, color: "var(--deep)" }}>
          {sections.map((section) => (
            <div key={section.id} id={section.id} className="legal-sec" style={{ display: "flex", gap: 16, alignItems: "flex-start", scrollMarginTop: 130 }}>
              <span aria-hidden="true" style={{ flex: "0 0 auto", display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 10, background: "var(--ivory)", color: "var(--gold)" }}>
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {LEGAL_ICONS[section.icon]}
                </svg>
              </span>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: 19, fontWeight: 900, margin: "0 0 8px" }}>{t(section.headingKey)}</h2>
                <p style={{ margin: 0, color: "var(--muted)" }}>{t(section.bodyKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
