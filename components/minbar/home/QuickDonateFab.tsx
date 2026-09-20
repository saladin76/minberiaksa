"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { CartFreqKey } from "@/lib/minbar/cart";
import {
  QF_CUSTOM_INPUT,
  QF_GROUP_ROW,
  QF_LEGEND,
  QF_PANEL,
  QF_PICKER_LIST,
  QF_PICKER_TRIGGER,
  QF_PILL,
  QF_SUBMIT,
  QfCheck,
  QfChevron,
  QfPillIcon,
  QfSubmitArrow,
  qfAmountStyle,
  qfFreqStyle,
  qfRowStyle,
} from "@/components/minbar/shell/quick-donate-styles";

/**
 * The pill that follows the homepage quick-donation card once it has scrolled
 * out of view — the same red pill and compact panel every inner page carries
 * (`shell/QuickDonate`, from `Minbar/التبرع السريع.dc.html`), so the whole
 * site has one floating quick-donate control rather than a bar here and a
 * pill everywhere else.
 *
 * It owns no donation state. The card owns it and hands it down, so a preset
 * chosen in the panel is the preset the card shows when the visitor scrolls
 * back, and what the dashboard allows (presets, destinations, frequencies,
 * the free field) is what the panel offers. The only state here is whether
 * the panel is open and which parts of the project list are unfolded.
 *
 * Placement is the handoff's: a third of the way down the end edge on a
 * desktop, where it clears both the header and the footer's reach; the
 * bottom corner on a phone, within the thumb's reach, with the panel pinned
 * above it (`.quickfab` in minbar.css).
 */

export interface FabDestination {
  value: string;
  label: string;
  /** Projects are grouped under this heading; generic intentions carry none. */
  group?: string | null;
}

export interface QuickDonateFabProps {
  dir: "rtl" | "ltr";
  labels: {
    pill: string;
    destination: string;
    frequency: string;
    amount: string;
    customAmount: string;
    submit: string;
    freq: Record<CartFreqKey, string>;
  };
  destinations: FabDestination[];
  destination: string;
  onDestination: (value: string) => void;
  frequencies: readonly CartFreqKey[];
  freq: CartFreqKey;
  onFreq: (value: CartFreqKey) => void;
  /** The presets, already rendered as money in the currency they are in. */
  amounts: Array<{ value: number; text: string }>;
  amountCurrency: string;
  amount: number;
  /** `null` = a preset is selected; a string = the free field is in use. */
  custom: string | null;
  onAmount: (value: number) => void;
  onCustom: (value: string) => void;
  allowCustom: boolean;
  customSymbol: string;
  canGive: boolean;
  onSubmit: () => void;
}

export default function QuickDonateFab(p: QuickDonateFabProps) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const generic = useMemo(() => p.destinations.filter((d) => !d.group), [p.destinations]);
  const groups = useMemo(() => {
    const map = new Map<string, FabDestination[]>();
    for (const d of p.destinations) {
      if (!d.group) continue;
      const list = map.get(d.group) ?? [];
      list.push(d);
      map.set(d.group, list);
    }
    return [...map.entries()].map(([label, items]) => ({ label, items }));
  }, [p.destinations]);

  const selectedLabel = p.destinations.find((d) => d.value === p.destination)?.label ?? "";
  const pick = (value: string) => {
    p.onDestination(value);
    setPickerOpen(false);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    p.onSubmit();
  };

  return (
    <div
      id="quick-fab"
      className="quickfab"
      data-qopen={open ? "true" : "false"}
      dir={p.dir}
      style={{
        position: "fixed",
        insetInlineEnd: "max(10px,2.5vw)",
        top: "38%",
        zIndex: 75,
        maxWidth: "94vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        fontFamily: "var(--font-ar)",
      }}
    >
      <button type="button" className="qf-handle" aria-expanded={open} aria-controls="quick-fab-panel" aria-label={p.labels.pill} onClick={() => setOpen((v) => !v)} style={QF_PILL}>
        <QfPillIcon open={open} />
        <span className="qf-label">{p.labels.pill}</span>
      </button>

      {open ? (
        <form id="quick-fab-panel" onSubmit={submit} style={{ ...QF_PANEL, marginTop: 10 }}>
          {/* Where it goes: one trigger, then the intentions and the projects
              under their regions — a list to unfold, not a native popup. */}
          {p.destinations.length > 1 ? (
            <div>
              <button type="button" onClick={() => setPickerOpen((v) => !v)} aria-expanded={pickerOpen} aria-label={p.labels.destination} style={QF_PICKER_TRIGGER}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedLabel}</span>
                <span aria-hidden="true" style={{ display: "inline-flex", color: "#D39A27" }}>
                  <QfChevron open={pickerOpen} />
                </span>
              </button>

              {pickerOpen ? (
                <div style={QF_PICKER_LIST}>
                  {generic.map((d) => (
                    <button key={d.value} type="button" onClick={() => pick(d.value)} style={qfRowStyle(d.value === p.destination)}>
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
                      {d.value === p.destination ? <QfCheck /> : null}
                    </button>
                  ))}
                  {groups.map((group) => {
                    const unfolded = openGroups[group.label] === true;
                    return (
                      <div key={group.label}>
                        <button type="button" onClick={() => setOpenGroups((prev) => ({ ...prev, [group.label]: !unfolded }))} aria-expanded={unfolded} style={QF_GROUP_ROW}>
                          <span>{group.label}</span>
                          <span aria-hidden="true" style={{ display: "inline-flex", color: "#D39A27" }}>
                            <QfChevron open={unfolded} size={13} />
                          </span>
                        </button>
                        {unfolded
                          ? group.items.map((d) => (
                              <button key={d.value} type="button" onClick={() => pick(d.value)} style={qfRowStyle(d.value === p.destination)}>
                                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
                                {d.value === p.destination ? <QfCheck /> : null}
                              </button>
                            ))
                          : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* How often */}
          {p.frequencies.length > 1 ? (
            <fieldset style={{ display: "grid", gap: 6, border: 0, padding: 0, margin: 0 }}>
              <legend style={QF_LEGEND}>{p.labels.frequency}</legend>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 6, marginTop: 8, minWidth: 0 }}>
                {p.frequencies.map((id) => (
                  <label key={id} style={{ display: "block", minWidth: 0 }}>
                    <input type="radio" name="freq" value={id} checked={p.freq === id} onChange={() => p.onFreq(id)} style={{ position: "absolute", opacity: 0, pointerEvents: "none" }} />
                    <span style={qfFreqStyle(p.freq === id)}>{p.labels.freq[id]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {/* How much */}
          <fieldset style={{ display: "grid", gap: 6, border: 0, padding: 0, margin: 0 }}>
            <legend style={QF_LEGEND}>
              {p.labels.amount} · <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{p.amountCurrency}</span>
            </legend>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(4, Math.max(2, p.amounts.length))}, minmax(0,1fr))`, gap: 5, marginTop: 8, minWidth: 0 }}>
              {p.amounts.map((preset) => {
                const active = p.custom === null && p.amount === preset.value;
                return (
                  <button key={preset.value} type="button" className="qf-amt" aria-pressed={active} onClick={() => p.onAmount(preset.value)} style={qfAmountStyle(active)}>
                    <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{preset.text}</span>
                  </button>
                );
              })}
            </div>
            {p.allowCustom ? (
              <label style={{ position: "relative", display: "block" }}>
                <input
                  inputMode="numeric"
                  value={p.custom ?? ""}
                  onChange={(e) => p.onCustom(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))}
                  placeholder={p.labels.customAmount}
                  aria-label={p.labels.customAmount}
                  style={{ ...QF_CUSTOM_INPUT, paddingInlineEnd: 40 }}
                />
                <span dir="ltr" aria-hidden="true" style={{ position: "absolute", insetInlineEnd: 13, top: "50%", marginTop: 3, transform: "translateY(-50%)", fontSize: 12.5, fontWeight: 800, color: "#52616B", unicodeBidi: "isolate" }}>
                  {p.customSymbol}
                </span>
              </label>
            ) : null}
          </fieldset>

          <button type="submit" disabled={!p.canGive} style={{ ...QF_SUBMIT, opacity: p.canGive ? 1 : 0.55, cursor: p.canGive ? "pointer" : "not-allowed" }}>
            {p.labels.submit}
            <QfSubmitArrow dir={p.dir} />
          </button>
        </form>
      ) : null}
    </div>
  );
}
