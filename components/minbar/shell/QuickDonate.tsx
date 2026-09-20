"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import { miaPath } from "@/lib/minbar/routes";
import { addToCart, type CartFreqKey } from "@/lib/minbar/cart";
import type { MinbarProject } from "@/lib/minbar/projects";
import { qfAmountStyle, qfFreqStyle, qfRowStyle } from "./quick-donate-styles";

/**
 * Quick donation widget — ported from `Minbar/التبرع السريع.dc.html`.
 *
 * Included on every page, so it has to be localised: leaving it Arabic would
 * hand every non-Arabic session an Arabic donation widget.
 *
 * Behaviour carried over from the handoff:
 *  - The frequency is stored as a stable id (`once`/`daily`/`friday`/`monthly`)
 *    and only its label is translated, so a cart written today still reads
 *    correctly after the visitor switches language.
 *  - Submitting adds the selection to the shared giving basket and then always
 *    routes to the cart. There is deliberately no direct path from here to
 *    checkout, so the donor sees their basket and can add to it.
 *  - The pill is fixed in the bottom inline-end corner, opposite the WhatsApp
 *    button, and opens upward from there. It used to be draggable from a point
 *    38% down the side, which put it over the content of every page, moved it
 *    to wherever a visitor happened to let go, and remembered nothing — so the
 *    next page put it back over the content again. A donation button belongs in
 *    the one place a visitor already looks for it.
 */

const FREQ_IDS: readonly CartFreqKey[] = ["once", "daily", "friday", "monthly"];
const FREQ_LABEL_KEYS = ["freqOnce", "freqDaily", "freqFriday", "freqMonthly"] as const;
const DEFAULT_AMOUNTS = [100, 300, 500, 700];

interface RegionGroup {
  region: string;
  label: string;
  items: MinbarProject[];
}

export interface QuickDonateProps {
  /** Overrides the default quick-pick amounts (USD). */
  amounts?: number[];
}

export default function QuickDonate({ amounts = DEFAULT_AMOUNTS }: QuickDonateProps) {
  const locale = useLocale();
  const dir = localeDirection(locale);
  const t = useTranslations("common");
  const router = useRouter();

  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<RegionGroup[]>([]);
  const [openRegions, setOpenRegions] = useState<Record<string, boolean>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<{ slug: string; label: string } | null>(null);
  const [freq, setFreq] = useState<CartFreqKey>("once");
  const [amount, setAmount] = useState<number>(amounts[0]);
  const [custom, setCustom] = useState("");


  const generalLabel = t("whereNeedGreatest");

  /* The project list is only needed once the panel is opened, so it is fetched
     then rather than on every page load. */
  useEffect(() => {
    if (!open || groups.length) return;
    let cancelled = false;
    fetch(`/api/minbar/projects?locale=${encodeURIComponent(locale)}`)
      .then((res) => (res.ok ? res.json() : { groups: [] }))
      .then((data) => {
        if (!cancelled) setGroups(Array.isArray(data.groups) ? data.groups : []);
      })
      .catch(() => {
        // The picker degrades to "where the need is greatest", which is a valid
        // destination — a failed list must not block giving.
      });
    return () => {
      cancelled = true;
    };
  }, [open, groups.length, locale]);

  const rowStyle = qfRowStyle;
  const freqStyle = qfFreqStyle;
  const amtStyle = qfAmountStyle;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(custom) || amount || 0;
    if (!(value > 0)) return;

    const isGeneral = !selected;
    addToCart({
      // The stable id is stored, never the displayed string — the cart resolves
      // the title live from the active locale.
      projectId: isGeneral ? undefined : selected.slug,
      titleKey: isGeneral ? "whereNeedGreatest" : undefined,
      title: isGeneral ? undefined : selected.label,
      typeKey: "project",
      freqKey: freq,
      amount: value,
      currency: "USD",
    });
    router.push(miaPath("cart", locale));
  };

  /* The homepage carries its own quick-donation card under the hero; a second
     widget floating beside it would compete with it and cover the hero's film
     card. Every other page keeps the pill. */
  if (/^\/[a-z]{2}(?:-[A-Za-z]{2})?\/?$/.test(pathname ?? "")) return null;

  return (
    <div
      id="quick-fab"
      className="quickfab"
      data-qopen={open ? "true" : "false"}
      dir={dir}
      style={{
        position: "fixed",
        /* The bottom inline-end corner. The WhatsApp button holds the opposite
           one (`insetInlineStart: 22`), so the two never meet, and neither sits
           over the page's own content. */
        insetInlineEnd: "max(14px,2.5vw)",
        bottom: "max(16px, env(safe-area-inset-bottom))",
        zIndex: 75,
        maxWidth: "94vw",
        /* Column-reverse so the panel opens upward from a button that is already
           at the bottom of the screen. */
        display: "flex",
        flexDirection: "column-reverse",
        alignItems: "flex-end",
        fontFamily: "var(--font-ar)",
      }}
    >
      <button
        type="button"
        className="qf-handle"
        aria-expanded={open}
        aria-label={t("quickDonate")}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          height: 50,
          padding: "0 20px",
          border: 0,
          borderRadius: 999,
          background: "linear-gradient(135deg, #C2453A, #8E2A20)",
          color: "#fff",
          fontFamily: "inherit",
          fontWeight: 900,
          fontSize: 14.5,
          cursor: "pointer",
          boxShadow: "0 14px 30px rgba(169,52,40,.38), inset 0 0 0 1px rgba(255,255,255,.16)",
          whiteSpace: "nowrap",
          maxWidth: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* The bolt turns into a close mark, so the one control says what it
            will do next rather than what it did. */}
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />}
        </svg>
        <span className="qf-label">{t("quickDonate")}</span>
      </button>

      {open ? (
        <form
          onSubmit={onSubmit}
          style={{
            marginBottom: 10,
            width: "min(288px,92vw)",
            boxSizing: "border-box",
            /* It opens upward from the foot of the screen, so on a short
               viewport it scrolls rather than running off the top. */
            maxHeight: "min(72vh, 620px)",
            overflowY: "auto",
            padding: 16,
            background: "#fff",
            border: "1px solid rgba(211,154,39,.5)",
            borderRadius: 14,
            boxShadow: "0 22px 48px rgba(16,33,43,.18)",
            display: "grid",
            gap: 12,
            overflow: "hidden",
          }}
        >
          {/* Destination picker */}
          <div>
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              aria-expanded={pickerOpen}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: 40,
                border: "1px solid rgba(16,33,43,.12)",
                borderRadius: 10,
                padding: "0 12px",
                fontFamily: "inherit",
                fontSize: 13.5,
                fontWeight: 800,
                color: "#10212B",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selected?.label ?? generalLabel}
              </span>
              <span aria-hidden="true" style={{ display: "inline-flex", color: "#D39A27" }}>
                <ChevronIcon open={pickerOpen} />
              </span>
            </button>

            {pickerOpen ? (
              <div
                style={{
                  marginTop: 6,
                  maxHeight: 260,
                  overflowY: "auto",
                  border: "1px solid rgba(16,33,43,.12)",
                  borderRadius: 10,
                  background: "#fff",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setPickerOpen(false);
                  }}
                  style={rowStyle(!selected)}
                >
                  <span>{generalLabel}</span>
                  {!selected ? <CheckIcon /> : null}
                </button>

                {groups.map((group) => {
                  const regionOpen = openRegions[group.region] === true;
                  return (
                    <div key={group.region}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenRegions((prev) => ({ ...prev, [group.region]: !prev[group.region] }))
                        }
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          background: "#F7F2EA",
                          border: 0,
                          borderTop: "1px solid rgba(16,33,43,.08)",
                          fontFamily: "inherit",
                          fontSize: 11.5,
                          fontWeight: 900,
                          color: "#52616B",
                          letterSpacing: ".04em",
                          cursor: "pointer",
                        }}
                      >
                        <span>{group.label}</span>
                        <span aria-hidden="true" style={{ display: "inline-flex", color: "#D39A27" }}>
                          <ChevronIcon open={regionOpen} size={13} />
                        </span>
                      </button>
                      {regionOpen
                        ? group.items.map((project) => {
                            const isSelected = selected?.slug === project.slug;
                            return (
                              <button
                                key={project.slug}
                                type="button"
                                onClick={() => {
                                  setSelected({ slug: project.slug, label: project.title });
                                  setPickerOpen(false);
                                }}
                                style={rowStyle(isSelected)}
                              >
                                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {project.title}
                                </span>
                                {isSelected ? <CheckIcon /> : null}
                              </button>
                            );
                          })
                        : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Frequency */}
          <fieldset style={{ display: "grid", gap: 6, border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 11, fontWeight: 900, color: "#52616B", letterSpacing: ".06em", padding: 0 }}>
              {t("frequency")}
            </legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 6, marginTop: 8, minWidth: 0 }}>
              {FREQ_IDS.map((id, i) => (
                <label key={id} style={{ display: "block", minWidth: 0 }}>
                  <input
                    type="radio"
                    name="freq"
                    value={id}
                    checked={freq === id}
                    onChange={() => setFreq(id)}
                    style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
                  />
                  <span style={freqStyle(freq === id)}>{t(FREQ_LABEL_KEYS[i])}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Amount */}
          <fieldset style={{ display: "grid", gap: 6, border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 11, fontWeight: 900, color: "#52616B", letterSpacing: ".06em", padding: 0 }}>
              {t("amount")} · <span dir="ltr" style={{ unicodeBidi: "isolate" }}>USD</span>
            </legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 5, marginTop: 8, minWidth: 0 }}>
              {amounts.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="qf-amt"
                  onClick={() => {
                    setAmount(value);
                    setCustom("");
                  }}
                  style={amtStyle(amount === value && !custom)}
                >
                  <span dir="ltr" style={{ unicodeBidi: "isolate" }}>${value}</span>
                </button>
              ))}
            </div>
            <input
              name="custom"
              inputMode="decimal"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={t("customAmount")}
              aria-label={t("customAmount")}
              style={{
                width: "100%",
                height: 40,
                marginTop: 6,
                padding: "0 13px",
                borderRadius: 10,
                border: "1px solid rgba(16,33,43,.12)",
                background: "#fff",
                fontFamily: "inherit",
                fontSize: 13.5,
                fontWeight: 800,
                color: "#10212B",
                boxSizing: "border-box",
              }}
            />
          </fieldset>

          <button
            type="submit"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              height: 44,
              border: 0,
              borderRadius: 999,
              background: "#A93428",
              color: "#fff",
              fontFamily: "inherit",
              fontWeight: 900,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            {t("donate")}
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              // "Continue" points at the end edge, so it mirrors with direction.
              style={{ transform: dir === "ltr" ? "scaleX(-1)" : undefined }}
            >
              <path d="M14 6l-6 6 6 6" />
            </svg>
          </button>
        </form>
      ) : null}
    </div>
  );
}

function ChevronIcon({ open, size = 14 }: { open?: boolean; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .2s ease" }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <span style={{ display: "inline-flex", color: "#A93428" }}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}
