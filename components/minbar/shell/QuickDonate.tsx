"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import { miaPath } from "@/lib/minbar/routes";
import { addToCart, type CartFreqKey } from "@/lib/minbar/cart";
import type { MinbarProject } from "@/lib/minbar/projects";

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
 *  - The pill is draggable by its handle; a drag is distinguished from a click
 *    by a 4px threshold, so dragging never toggles the panel open.
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

  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<RegionGroup[]>([]);
  const [openRegions, setOpenRegions] = useState<Record<string, boolean>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<{ slug: string; label: string } | null>(null);
  const [freq, setFreq] = useState<CartFreqKey>("once");
  const [amount, setAmount] = useState<number>(amounts[0]);
  const [custom, setCustom] = useState("");

  const fabRef = useRef<HTMLDivElement>(null);

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

  /* Drag by the handle. Position is written as physical left/top because it is a
     pointer coordinate, not a layout decision — there is nothing to mirror. */
  useEffect(() => {
    const handle = fabRef.current?.querySelector<HTMLElement>(".qf-handle");
    const fab = fabRef.current;
    if (!handle || !fab) return;

    const onPointerDown = (event: PointerEvent) => {
      const rect = fab.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      let moved = false;

      const move = (ev: PointerEvent) => {
        if (Math.abs(ev.clientX - event.clientX) + Math.abs(ev.clientY - event.clientY) < 4) return;
        moved = true;
        fab.style.left = `${Math.max(8, Math.min(window.innerWidth - rect.width - 8, ev.clientX - offsetX))}px`;
        fab.style.top = `${Math.max(8, Math.min(window.innerHeight - 60, ev.clientY - offsetY))}px`;
        fab.style.insetInlineEnd = "auto";
      };
      const up = (ev: PointerEvent) => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        // Only suppress the click when the pointer actually travelled, so a
        // plain tap still toggles the panel.
        if (moved) ev.preventDefault();
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    };

    handle.addEventListener("pointerdown", onPointerDown);
    return () => handle.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const rowStyle = (isSelected: boolean): CSSProperties => ({
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "9px 12px",
    background: isSelected ? "#FDF3DD" : "transparent",
    border: 0,
    borderTop: "1px solid rgba(16,33,43,.06)",
    fontFamily: "inherit",
    fontSize: 12.5,
    fontWeight: isSelected ? 900 : 700,
    color: isSelected ? "#10212B" : "#52616B",
    cursor: "pointer",
  });

  const freqStyle = (checked: boolean): CSSProperties => ({
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 6px",
    borderRadius: 999,
    border: `1px solid ${checked ? "#D39A27" : "rgba(16,33,43,.12)"}`,
    background: checked ? "#D39A27" : "#fff",
    color: checked ? "#fff" : "#10212B",
    fontSize: 12,
    fontWeight: checked ? 900 : 800,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    cursor: "pointer",
  });

  const amtStyle = (featured: boolean): CSSProperties => ({
    minWidth: 0,
    height: 36,
    padding: "0 2px",
    borderRadius: 999,
    border: `1px solid ${featured ? "#10212B" : "rgba(16,33,43,.12)"}`,
    background: featured ? "#10212B" : "#fff",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: featured ? 900 : 800,
    color: featured ? "#fff" : "#10212B",
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
  });

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

  return (
    <div
      ref={fabRef}
      id="quick"
      className="quickfab"
      data-qopen={open ? "true" : "false"}
      dir={dir}
      style={{
        position: "fixed",
        insetInlineEnd: "max(10px,2.5vw)",
        top: "38%",
        zIndex: 75,
        maxWidth: "94vw",
        fontFamily: "var(--font-ar)",
      }}
    >
      <button
        type="button"
        className="qf-handle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          height: 46,
          padding: "0 18px",
          border: 0,
          borderRadius: 999,
          background: "#A93428",
          color: "#fff",
          fontFamily: "inherit",
          fontWeight: 900,
          fontSize: 14,
          cursor: "grab",
          boxShadow: "0 12px 26px rgba(169,52,40,.32)",
          whiteSpace: "nowrap",
          maxWidth: "100%",
          boxSizing: "border-box",
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
        </svg>
        {t("quickDonate")}
      </button>

      {open ? (
        <form
          onSubmit={onSubmit}
          style={{
            marginTop: 10,
            width: "min(288px,92vw)",
            boxSizing: "border-box",
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
