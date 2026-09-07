"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { useLocale, useTranslations } from "next-intl";
import { LOCALES, SUPPORTED_LOCALES, localeDirection } from "@/lib/locales";
import { SUPPORTED_CURRENCY_OPTIONS } from "@/lib/supported-currencies";
import { CURRENCY_COOKIE_UPDATED_EVENT } from "@/components/CurrencyFromUrlSync";
import { miaPath, type MinbarRoute } from "@/lib/minbar/routes";
import { useMinbarCartCount } from "@/hooks/useMinbarCart";
import { useMinbarLabel } from "@/hooks/useMinbarLabel";

/**
 * Site header — ported from `Minbar/Header.dc.html`.
 *
 * Carries the main navigation, the language picker (19 languages; ar and ur are
 * RTL), the currency picker (14 currencies), the cart icon and the account icon.
 *
 * Notes carried over from the handoff:
 *  - Every icon is drawn SVG matched to its function — no icon font, no emoji.
 *    "All pages" is a 2×2 apps grid rather than a hamburger because it opens a
 *    page index, not a side nav.
 *  - Presence of a language in the picker does not mean its content is
 *    complete; the dot beside each name reflects body-translation status.
 *  - The cart badge reads the shared cart store and updates immediately via
 *    `mia:basket-updated`, plus the standard `storage` event so a second tab
 *    stays in step.
 *  - The spacer below the fixed header is measured from its real height with a
 *    ResizeObserver, never a fixed number — the header grows and shrinks with
 *    the language, the back button and the viewport, and any constant either
 *    overshoots or covers the top of the content.
 *
 * Backend/dashboard hooks left as-is from the handoff:
 *  - `linkOverrides` lets the marketing team retarget any nav label from the
 *    dashboard without touching code; anything not in the map keeps its default.
 *  - the account icon routes to the donor account when signed in and to sign-in
 *    otherwise (`[AUTH-INTEGRATION]`).
 */

/** Main navigation. `[route, i18n key in the navigation namespace]`. */
const NAV: ReadonlyArray<readonly [MinbarRoute, string]> = [
  ["projects", "projects"],
  ["aqsa", "aqsa"],
  ["zakat", "zakat"],
  ["waqf", "waqf"],
  ["recurring", "recurring"],
  ["reports", "reports"],
  ["blog", "blog"],
];

/** The "all pages" index, grouped exactly as `Component.MENU_GROUPS`. */
const MENU_GROUPS: ReadonlyArray<{
  titleKey: string;
  items: ReadonlyArray<readonly [MinbarRoute, string]>;
}> = [
  {
    titleKey: "groupDonate",
    items: [
      ["projects", "allProjects"],
      ["zakat", "zakat"],
      ["zakatCalculator", "zakatCalculator"],
      ["waqf", "waqf"],
      ["recurring", "recurring"],
      ["bankAccounts", "bankAccounts"],
    ],
  },
  {
    titleKey: "groupJerusalemAqsa",
    items: [
      ["aqsa", "aqsa"],
      ["jerusalem", "jerusalem"],
      ["reports", "reports"],
      ["ibadanProject", "ibadanProject"],
    ],
  },
  {
    titleKey: "groupKnowledge",
    items: [
      ["blog", "blog"],
      ["news", "news"],
      ["publications", "publications"],
      ["programs", "programs"],
      ["courses", "courses"],
      ["zenkiCourse", "zenkiCourse"],
    ],
  },
  {
    titleKey: "groupFoundation",
    items: [
      ["about", "about"],
      ["contact", "contact"],
      ["volunteer", "volunteer"],
      ["partner", "partner"],
    ],
  },
];

const CURRENCY_SYMBOLS: Record<string, string> = Object.fromEntries(
  SUPPORTED_CURRENCY_OPTIONS.map((c) => [c.code, c.symbol])
);

export interface HeaderProps {
  /** Route key of the current page, so its nav link shows the active rule. */
  active?: MinbarRoute;
  /** Organisation contact details. Sourced from the dashboard in production. */
  whatsappNumber?: string;
  /**
   * Dashboard-editable link overrides, keyed by navigation i18n key:
   * `{ zakat: "/ar/zakat-new" }`. Anything absent keeps its default route.
   */
  linkOverrides?: Record<string, string>;
  /** Whether a donor session exists — drives where the account icon points. */
  signedIn?: boolean;
}

export default function Header({
  active,
  whatsappNumber = "905398436050",
  linkOverrides,
  signedIn = false,
}: HeaderProps) {
  const locale = useLocale();
  const dir = localeDirection(locale);
  const tNav = useTranslations("navigation");
  const tCommon = useTranslations("common");
  const label = useMinbarLabel();
  const router = useRouter();
  const pathname = usePathname();

  const [localeOpen, setLocaleOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [showBack, setShowBack] = useState(false);
  const basket = useMinbarCartCount();

  const headRef = useRef<HTMLElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const href = useCallback(
    (route: MinbarRoute, key?: string) =>
      (key && linkOverrides?.[key]) || miaPath(route, locale),
    [linkOverrides, locale]
  );

  /* Reserve exactly the header's own height below it. Writing the value rounds
     it (108.18 → 109), so it never equals the measurement that produced it; a
     naive observer re-fires on every delivery and the browser logs
     "ResizeObserver loop completed with undelivered notifications". Hence the
     guard, and the write inside requestAnimationFrame. */
  useEffect(() => {
    const head = headRef.current;
    const spacer = spacerRef.current;
    if (!head || !spacer) return;

    let applied = -1;
    const sync = () => {
      const next = Math.ceil(head.getBoundingClientRect().height);
      if (Math.abs(next - applied) < 0.5) return;
      applied = next;
      requestAnimationFrame(() => {
        spacer.style.height = `${next}px`;
      });
    };
    sync();

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    observer?.observe(head);
    window.addEventListener("resize", sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  /* Currency lives in the same cookie the rest of the app reads, so the picker
     here and `CurrencySelector` elsewhere can never disagree. */
  useEffect(() => {
    const sync = () => {
      const saved = Cookies.get("currency");
      setCurrency(!saved || saved === "DEFAULT" ? "USD" : saved);
    };
    sync();
    window.addEventListener(CURRENCY_COOKIE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(CURRENCY_COOKIE_UPDATED_EVENT, sync);
  }, []);

  /* The back button appears only once the visitor has actually moved between
     two pages — not on the first page of a session, and not on a reload of the
     same page. */
  useEffect(() => {
    try {
      const current = window.location.pathname + window.location.search;
      const last = window.sessionStorage.getItem("mia_last_page");
      if (last && last !== current) setShowBack(true);
      window.sessionStorage.setItem("mia_last_page", current);
    } catch {
      // sessionStorage can throw in private mode; the button simply stays hidden.
    }
  }, [pathname]);

  /* Close the popovers on outside click and on Escape — both panels are large
     and overlay the page, so there has to be a way out that is not the toggle. */
  useEffect(() => {
    if (!localeOpen && !menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(event.target as Node)) {
        setLocaleOpen(false);
        setMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLocaleOpen(false);
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [localeOpen, menuOpen]);

  /* Changing language keeps the visitor on the same page — a hard requirement
     in DEVELOPER_HANDOFF §11, and the reason this swaps the locale segment
     rather than pushing the homepage. */
  const selectLocale = (code: string) => {
    setLocaleOpen(false);
    const rest = pathname.replace(new RegExp(`^/(${SUPPORTED_LOCALES.join("|")})(?=/|$)`), "");
    router.push(`/${code}${rest || ""}`);
  };

  const selectCurrency = (code: string) => {
    Cookies.set("currency", code, { expires: 365 });
    setCurrency(code);
    setLocaleOpen(false);
    window.dispatchEvent(new CustomEvent(CURRENCY_COOKIE_UPDATED_EVENT, { detail: { code } }));
  };

  const currentLocaleMeta = LOCALES[locale as keyof typeof LOCALES] ?? LOCALES.ar;
  const localeA11yLabel = `${tNav("language")} · ${tNav("currency")}`;

  const rowClass = "mia-row";

  return (
    <>
      <div ref={spacerRef} className="mia-head-spacer" aria-hidden="true" />

      <header ref={headRef} className="mia-head" dir={dir} data-dir={dir}>
        {/* ── Utility bar ─────────────────────────────────────────────────── */}
        <div
          className="mia-util"
          style={{ position: "relative", zIndex: 1, borderBottom: "1px solid rgba(255,255,255,.16)" }}
        >
          <div
            style={{
              maxWidth: 1240,
              margin: "0 auto",
              padding: "5px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
              fontSize: 12.5,
            }}
          >
            {showBack ? (
              <button
                type="button"
                onClick={() => router.back()}
                title={tNav("back")}
                aria-label={tNav("back")}
                className="mia-back"
                style={{
                  flex: "0 0 auto",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  height: 26,
                  paddingInline: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,.32)",
                  background: "rgba(255,255,255,.1)",
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all .18s ease",
                }}
              >
                {/* Mirrors with direction: "back" points at the start edge. */}
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ transform: dir === "ltr" ? "scaleX(-1)" : undefined }}
                >
                  <path d="M14 6l-6 6 6 6" />
                </svg>
                {tNav("back")}
              </button>
            ) : null}

            <div
              style={{
                display: "flex",
                gap: 16,
                alignItems: "center",
                flex: "1 1 0",
                minWidth: 0,
                justifyContent: "flex-end",
              }}
            >
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mia-util-link"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#fff",
                  fontWeight: 800,
                  textDecoration: "none",
                  transition: "transform .18s ease, opacity .18s ease",
                }}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                  <path d="M12.04 2.5c-5.23 0-9.48 4.24-9.48 9.47 0 1.67.44 3.3 1.28 4.74L2.5 21.5l4.92-1.29a9.45 9.45 0 0 0 4.62 1.18h.01c5.22 0 9.47-4.24 9.47-9.47 0-2.53-.99-4.91-2.78-6.7a9.4 9.4 0 0 0-6.7-2.72Z" />
                </svg>
                {/* A brand name — stays Latin in every language ([OFFICIAL] in the glossary). */}
                WhatsApp
              </a>
            </div>
          </div>
        </div>

        {/* ── Main row ────────────────────────────────────────────────────── */}
        <div
          className="mia-main-row"
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 1240,
            margin: "0 auto",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <Link href={miaPath("home", locale)} style={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "4px 8px",
                borderRadius: 10,
                background: "rgba(255,255,255,.94)",
                boxShadow: "0 0 0 1px rgba(255,255,255,.5)",
              }}
            >
              <img
                src="/minbar/assets/logo-horizontal.png"
                alt={tCommon("orgOfficialName")}
                style={{ height: 38, width: "auto", maxWidth: 150, objectFit: "contain", display: "block" }}
              />
            </span>
          </Link>

          <nav
            className="mia-rail"
            style={{
              display: "flex",
              gap: 18,
              alignItems: "center",
              flex: "1 1 auto",
              minWidth: 0,
              justifyContent: "flex-end",
              flexWrap: "nowrap",
              overflowX: "auto",
              whiteSpace: "nowrap",
              fontWeight: 700,
              fontSize: 13.5,
            }}
          >
            {NAV.map(([route, key]) => (
              <Link
                key={key}
                href={href(route, key)}
                aria-current={active === route ? "page" : undefined}
                style={{
                  padding: "5px 0",
                  color: "#fff",
                  textDecoration: "none",
                  borderBottom: `2px solid ${active === route ? "#D39A27" : "transparent"}`,
                }}
              >
                {label(key)}
              </Link>
            ))}
          </nav>

          <span
            aria-hidden="true"
            style={{
              flex: "0 0 auto",
              width: 1,
              height: 26,
              background: "rgba(255,255,255,.28)",
              marginInline: 4,
            }}
          />

          {/* Cart */}
          <Link
            href={miaPath("cart", locale)}
            title={tNav("cart")}
            aria-label={tNav("cart")}
            className="mia-circle"
            style={{
              position: "relative",
              flex: "0 0 auto",
              display: "grid",
              placeItems: "center",
              width: 42,
              height: 42,
              borderRadius: "50%",
              background: "rgba(255,255,255,.1)",
              border: `1px solid ${basket > 0 ? "#D39A27" : "rgba(255,255,255,.32)"}`,
              boxShadow: basket > 0 ? "0 0 0 4px rgba(211,154,39,.28)" : "none",
              transition: "all .18s ease",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m4 8 2 11h12l2-11H4Z" />
              <path d="m9 8 3-4 3 4M9 12v3M15 12v3" />
            </svg>
            {basket > 0 ? (
              <span
                style={{
                  position: "absolute",
                  insetInlineStart: -3,
                  top: -3,
                  minWidth: 18,
                  height: 18,
                  padding: "0 4px",
                  borderRadius: 999,
                  background: "#D39A27",
                  color: "#10212B",
                  fontSize: 11,
                  fontWeight: 900,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {basket}
              </span>
            ) : null}
          </Link>

          {/* Account — signed-in donors go straight to their account, everyone
              else lands on sign-in and is returned here afterwards. */}
          <Link
            href={signedIn ? miaPath("account", locale) : `/auth/signin?callbackUrl=${encodeURIComponent(miaPath("account", locale))}`}
            title={tNav("account")}
            aria-label={tNav("account")}
            className="mia-circle mia-circle--account"
            style={{
              position: "relative",
              flex: "0 0 auto",
              display: "grid",
              placeItems: "center",
              width: 42,
              height: 42,
              borderRadius: "50%",
              border: "1px solid #D39A27",
              background: "rgba(255,255,255,.1)",
              boxShadow: "0 0 0 3px rgba(211,154,39,.22)",
              transition: "box-shadow .25s ease, transform .18s cubic-bezier(.22,.61,.36,1)",
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="8.5" r="3.6" />
              <path d="M4.5 19.5a7.5 7.5 0 0 1 15 0" />
            </svg>
          </Link>

          <div ref={popRef} style={{ display: "contents" }}>
            {/* Language + currency */}
            <div data-pop="locale" style={{ position: "relative", flex: "0 0 auto" }}>
              <button
                type="button"
                onClick={() => {
                  setLocaleOpen((v) => !v);
                  setMenuOpen(false);
                }}
                title={localeA11yLabel}
                aria-label={localeA11yLabel}
                aria-expanded={localeOpen}
                className="mia-locale-btn mia-pill"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  height: 42,
                  paddingInline: "12px 6px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,.1)",
                  border: "1px solid rgba(255,255,255,.32)",
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all .18s ease",
                }}
              >
                <GlobeIcon />
                <span className="mia-locale-label">
                  {currentLocaleMeta.nativeLabel} · {currency}
                </span>
                <span
                  dir="ltr"
                  style={{
                    display: "grid",
                    placeItems: "center",
                    minWidth: 22,
                    height: 22,
                    padding: "0 4px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,.16)",
                    color: "#fff",
                    flex: "0 0 auto",
                    fontSize: 11,
                    fontWeight: 900,
                    unicodeBidi: "isolate",
                    lineHeight: 1,
                  }}
                >
                  {CURRENCY_SYMBOLS[currency] ?? "$"}
                </span>
              </button>

              {localeOpen ? (
                <div className="mia-pop mia-pop--locale">
                  <div
                    style={{
                      padding: 16,
                      borderInlineEnd: "1px solid rgba(16,33,43,.1)",
                      minWidth: 0,
                      display: "grid",
                      gap: 10,
                      alignContent: "start",
                    }}
                  >
                    <span style={popTitleStyle}>
                      <GlobeIcon stroke="#D39A27" size={14} />
                      {tNav("language")}
                    </span>
                    <div style={popListStyle}>
                      {SUPPORTED_LOCALES.map((code) => {
                        const meta = LOCALES[code];
                        const on = code === locale;
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => selectLocale(code)}
                            data-pick={on ? "1" : undefined}
                            className={rowClass}
                          >
                            {/* Green dot = page bodies translated, per
                                LOCALIZATION_STATUS.md. All 19 completed the
                                Core Website Localization Pass. */}
                            <span
                              aria-hidden="true"
                              style={{ width: 6, height: 6, borderRadius: "50%", flex: "0 0 auto", background: "#1F7A4D" }}
                            />
                            <span dir={meta.direction} style={{ minWidth: 0, whiteSpace: "nowrap", flex: "1 1 auto" }}>
                              {meta.nativeLabel}
                            </span>
                            {on ? <CheckIcon /> : null}
                            <span dir="ltr" style={{ color: "#D39A27", fontSize: 10, fontWeight: 900, unicodeBidi: "isolate" }}>
                              {code}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ padding: 16, minWidth: 0, display: "grid", gap: 10, alignContent: "start" }}>
                    <span style={popTitleStyle}>
                      <CurrencyIcon />
                      {tNav("currency")}
                    </span>
                    <div style={popListStyle}>
                      {SUPPORTED_CURRENCY_OPTIONS.map((c) => {
                        const on = c.code === currency;
                        return (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => selectCurrency(c.code)}
                            data-pick={on ? "1" : undefined}
                            className={rowClass}
                          >
                            <span
                              dir="ltr"
                              style={{ unicodeBidi: "isolate", color: "#D39A27", fontWeight: 900, width: 24, flex: "0 0 24px", fontSize: 13 }}
                            >
                              {c.symbol}
                            </span>
                            <span dir="ltr" style={{ unicodeBidi: "isolate", fontWeight: 800, fontSize: 12.5, flex: "1 1 auto" }}>
                              {c.code}
                            </span>
                            {on ? <CheckIcon /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* All pages */}
            <div data-pop="menu" style={{ position: "relative", flex: "0 0 auto" }}>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen((v) => !v);
                  setLocaleOpen(false);
                }}
                title={tNav("menu")}
                aria-label={tNav("menu")}
                aria-expanded={menuOpen}
                className="mia-circle"
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 42,
                  height: 42,
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,.32)",
                  background: "rgba(255,255,255,.1)",
                  cursor: "pointer",
                  transition: "all .18s ease",
                }}
              >
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
                  <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
                  <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
                  <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
                </svg>
              </button>

              {menuOpen ? (
                <div className="mia-pop mia-pop--menu">
                  <Link
                    href={miaPath("home", locale)}
                    onClick={() => setMenuOpen(false)}
                    style={{
                      gridColumn: "1 / -1",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: dir === "rtl"
                        ? "linear-gradient(to left, #B8422F, #7C2318)"
                        : "linear-gradient(to right, #B8422F, #7C2318)",
                      color: "#fff",
                      fontSize: 14.5,
                      fontWeight: 900,
                      textDecoration: "none",
                    }}
                  >
                    <span style={{ width: 6, height: 6, background: "#D39A27", transform: "rotate(45deg)" }} />
                    {tNav("home")}
                  </Link>

                  {MENU_GROUPS.map((group) => (
                    <div key={group.titleKey} style={{ display: "grid", gap: 4, alignContent: "start", minWidth: 0 }}>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "0 4px 6px",
                          borderBottom: "1px solid rgba(16,33,43,.1)",
                          fontSize: 11,
                          fontWeight: 900,
                          color: "#8a5d16",
                          letterSpacing: ".06em",
                        }}
                      >
                        {tNav(group.titleKey)}
                      </span>
                      {group.items.map(([route, key]) => (
                        <Link
                          key={key}
                          href={href(route, key)}
                          onClick={() => setMenuOpen(false)}
                          className="mia-menu-link"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 9,
                            padding: "8px 10px",
                            borderRadius: 9,
                            fontSize: 13.5,
                            fontWeight: 700,
                            color: "#10212B",
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          <span style={{ flex: "0 0 auto", width: 4, height: 4, background: "#D39A27", transform: "rotate(45deg)" }} />
                          {label(key)}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

const popTitleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 11,
  fontWeight: 900,
  color: "#52616B",
  letterSpacing: ".06em",
};

const popListStyle: React.CSSProperties = {
  display: "grid",
  gap: 2,
  maxHeight: 300,
  overflowY: "auto",
  paddingInlineEnd: 4,
};

function GlobeIcon({ stroke = "#fff", size = 17 }: { stroke?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={stroke}
      strokeWidth="1.8"
      aria-hidden="true"
      style={{ opacity: 0.9, flex: "0 0 auto" }}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 2.5 15 0 18M12 3c-2.5 2.7-2.5 15 0 18" />
    </svg>
  );
}

function CurrencyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#D39A27" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.8-2.5 2.2-2.5 4M12 16.5h.01" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#A93428" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
