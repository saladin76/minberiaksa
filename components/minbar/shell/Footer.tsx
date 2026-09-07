"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import { miaPath, type MinbarRoute } from "@/lib/minbar/routes";
import { ORG } from "@/lib/minbar/org";
import { useMinbarLabel } from "@/hooks/useMinbarLabel";
import SocialIcon, { type SocialIconName } from "./SocialIcon";

/**
 * Site footer — ported from `Minbar/Footer.dc.html`.
 *
 * Four link columns plus the identity column, a wave-masked closing photograph
 * of the Old City, and the copyright rule. A WhatsApp FAB is pinned to the
 * start edge of the viewport.
 *
 * Direction is derived from the locale, never hard-coded — otherwise the footer
 * stays mirrored inside an LTR page.
 *
 * Dashboard hooks from the handoff: `socialLinks` and `columns` may both be
 * supplied per language (different accounts and numbers per market), and the
 * organisation details are the same single source the header uses.
 */

interface FooterColumn {
  titleKey: string;
  links: ReadonlyArray<{ route: MinbarRoute; key: string; hash?: string }>;
}

const COLUMNS: readonly FooterColumn[] = [
  {
    titleKey: "donate",
    links: [
      { route: "projects", key: "allProjects" },
      { route: "zakat", key: "zakat" },
      { route: "zakatCalculator", key: "zakatCalculator" },
      { route: "waqf", key: "waqf" },
      { route: "recurring", key: "recurring" },
      { route: "cart", key: "cart" },
    ],
  },
  {
    titleKey: "jerusalem",
    links: [
      { route: "aqsa", key: "aqsa" },
      { route: "jerusalem", key: "jerusalem" },
      { route: "ibadanProject", key: "ibadanProject" },
      { route: "reports", key: "reports" },
      { route: "blog", key: "blog" },
      { route: "news", key: "news" },
      { route: "courses", key: "courses" },
      { route: "programs", key: "programs" },
      { route: "publications", key: "publications" },
    ],
  },
  {
    titleKey: "about",
    links: [
      { route: "about", key: "about" },
      { route: "contact", key: "contact" },
      { route: "volunteer", key: "volunteer" },
      { route: "partner", key: "partner" },
      { route: "account", key: "account" },
      { route: "home", key: "faq", hash: "faq" },
    ],
  },
  {
    titleKey: "legal",
    links: [
      { route: "privacy", key: "privacy" },
      { route: "terms", key: "terms" },
      { route: "donationPolicy", key: "donationPolicy" },
      { route: "cookies", key: "cookies" },
      { route: "accessibility", key: "accessibility" },
    ],
  },
];

export interface FooterProps {
  orgName?: string;
  tagline?: string;
  address?: string;
  email?: string;
  phone?: string;
  whatsappNumber?: string;
  closingImage?: string;
  socialLinks?: ReadonlyArray<{ label: string; href: string; icon: SocialIconName }>;
}

export default function Footer({
  orgName,
  tagline,
  address = ORG.address,
  email = ORG.email,
  phone = ORG.phone,
  whatsappNumber = ORG.whatsapp,
  closingImage = "/minbar/assets/footer-quds.jpg",
  socialLinks,
}: FooterProps) {
  const locale = useLocale();
  const dir = localeDirection(locale);
  const tCommon = useTranslations("common");
  const label = useMinbarLabel();

  /* Mobile accordion. On desktop the CSS keeps every list open regardless. */
  const [openCol, setOpenCol] = useState(-1);

  const name = orgName || tCommon("orgOfficialName");
  const lead = tagline;
  const whatsappHref = `https://wa.me/${whatsappNumber}`;

  const social =
    socialLinks ??
    ([
      // Platform names are Latin brand names — unchanged in every language.
      { label: "WhatsApp", href: whatsappHref, icon: "whatsapp" },
      { label: "Facebook", href: "https://www.facebook.com/minberiaksa", icon: "facebook" },
      { label: "Instagram", href: "https://www.instagram.com/minberiaksa", icon: "instagram" },
      { label: "YouTube", href: "https://www.youtube.com/@minberiaksa", icon: "youtube" },
      { label: "X", href: "https://x.com/minberiaksa", icon: "x" },
    ] as const);

  return (
    <>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        title={tCommon("contactViaWhatsapp")}
        aria-label="WhatsApp"
        className="mia-wa-fab"
        style={{
          position: "fixed",
          insetInlineStart: 22,
          bottom: "max(22px, env(safe-area-inset-bottom))",
          zIndex: 70,
          display: "grid",
          placeItems: "center",
          width: 54,
          height: 54,
          borderRadius: 999,
          background: "#1F7A4D",
          color: "#fff",
          boxShadow: "0 12px 24px rgba(31,122,77,.3)",
        }}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
          <path d="M12.04 2.5c-5.23 0-9.48 4.24-9.48 9.47 0 1.67.44 3.3 1.28 4.74L2.5 21.5l4.92-1.29a9.45 9.45 0 0 0 4.62 1.18h.01c5.22 0 9.47-4.24 9.47-9.47 0-2.53-.99-4.91-2.78-6.7a9.4 9.4 0 0 0-6.7-2.72Zm0 17.06h-.01a7.87 7.87 0 0 1-4.01-1.1l-.29-.17-2.92.76.78-2.85-.19-.29a7.85 7.85 0 0 1-1.2-4.19c0-4.34 3.53-7.87 7.88-7.87 2.1 0 4.08.82 5.56 2.31a7.82 7.82 0 0 1 2.3 5.57c0 4.34-3.53 7.83-7.9 7.83Zm4.32-5.87c-.24-.12-1.4-.69-1.61-.77-.22-.08-.38-.12-.54.12-.16.24-.62.77-.76.93-.14.16-.28.18-.52.06-.24-.12-1-.37-1.9-1.18-.7-.63-1.18-1.4-1.32-1.64-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.46-.39-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.19 1.1.16 1.52.1.46-.07 1.4-.57 1.6-1.13.2-.55.2-1.03.14-1.13-.06-.1-.22-.16-.46-.28Z" />
        </svg>
      </a>

      <footer
        id="contact"
        className="mia-foot"
        dir={dir}
        style={{ background: "#fff", color: "#10212B", fontFamily: "var(--font-ar)" }}
      >
        <div
          className="cols"
          id="footcols"
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            padding: "40px 26px 46px",
            display: "grid",
            gridTemplateColumns: "minmax(0,1.3fr) repeat(4,minmax(0,.78fr))",
            gap: 28,
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <img
              src="/minbar/assets/logo-horizontal.png"
              alt={name}
              style={{
                height: 64,
                width: 230,
                objectFit: "contain",
                objectPosition: dir === "rtl" ? "right center" : "left center",
              }}
            />
            <p style={{ margin: 0, lineHeight: 1.8, fontSize: 14, color: "#52616B" }}>{lead}</p>
            <p style={{ margin: 0, fontSize: 13, color: "#52616B", lineHeight: 1.8 }}>
              {address}
              <br />
              {email}
              <br />
              {/* Latin-script data stays isolated so bidi cannot reorder it. */}
              <span dir="ltr" style={{ unicodeBidi: "isolate", display: "inline-block" }}>
                {phone}
              </span>
            </p>
            <div style={{ display: "flex", gap: 9, paddingTop: 2 }}>
              {social.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  title={s.label}
                  className="social-ic"
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    border: "1px solid rgba(16,33,43,.14)",
                    color: "#10212B",
                  }}
                >
                  <SocialIcon name={s.icon} />
                </a>
              ))}
            </div>
          </div>

          {COLUMNS.map((col, index) => {
            const open = openCol === index;
            return (
              <div key={col.titleKey} className="fcol" data-open={open ? "true" : "false"} style={{ display: "grid", gap: 12, alignContent: "start" }}>
                <button
                  type="button"
                  className="fcol-head"
                  onClick={() => setOpenCol(open ? -1 : index)}
                  aria-expanded={open}
                >
                  {label(col.titleKey)}
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <div className="fcol-links">
                  {col.links.map((link) => (
                    <Link
                      key={link.key}
                      href={`${miaPath(link.route, locale)}${link.hash ? `#${link.hash}` : ""}`}
                    >
                      {label(link.key)}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ position: "relative", overflow: "hidden" }}>
          {/* A wave cut out of the white above, so the photograph meets the
              content on a curve rather than a hard edge. Symmetric, so it does
              not need mirroring. */}
          <svg
            viewBox="0 0 1440 60"
            preserveAspectRatio="none"
            aria-hidden="true"
            style={{ position: "absolute", top: -1, insetInlineStart: 0, width: "100%", height: 60, zIndex: 2 }}
          >
            <path d="M0 30 C 240 60 480 0 720 22 C 960 44 1200 6 1440 30 L1440 0 L0 0 Z" fill="#fff" />
          </svg>
          <img
            src={closingImage}
            alt={tCommon("oldCityViewAlt")}
            loading="lazy"
            decoding="async"
            style={{ display: "block", width: "100%", height: "auto", aspectRatio: "1240/300" }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "13px 24px",
            background: "#10212B",
            fontSize: 12.5,
            fontWeight: 700,
            color: "rgba(255,255,255,.75)",
            textAlign: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            ©{" "}
            <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
              {new Date().getFullYear()}
            </span>{" "}
            {name} — {tCommon("allRightsReserved")}
          </span>
        </div>
      </footer>
    </>
  );
}
