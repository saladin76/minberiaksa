"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { addToCart, type CartFreqKey } from "@/lib/minbar/cart";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import type { MinbarProject } from "@/lib/minbar/projects";

/**
 * The quick-donation card under the hero.
 *
 * Two earlier versions failed the same test — can a visitor understand it in
 * one glance? The first was a 68px strip pinned to the top of the viewport
 * holding a 138-option select, four frequency chips, four amounts and a free
 * field. The second broke that into three numbered steps, but a numbered
 * procedure reads as work: two chip rows, a select, an amount grid, a free
 * field, a running summary and a button, plus a phone sheet and a bar that
 * pinned itself under the header and covered the navigation.
 *
 * This version is a form with three inputs and a receipt, in the shape every
 * checkout already uses: the choices on one side, what they add up to on the
 * other.
 *
 *   amount → destination → frequency          |  الإجمالي  US$300
 *                                             |  شهريًا · حيث الحاجة أشد
 *                                             |  [ تبرّع الآن ]
 *
 * What that buys:
 *   · Amount first and largest. It is the decision a donor actually arrives
 *     with, and the one that sets the gift's size; the middle preset is marked
 *     as suggested and selected, so the card is answerable with one press.
 *   · The destination is ONE native select — the generic intentions first,
 *     then every project under a group. The old pair (four chips AND a select
 *     that could disagree with them) was the single most confusing thing here.
 *   · The frequency is one segmented control, not four loose chips, so it
 *     reads as one setting with four states.
 *   · The panel restates the whole decision in words before the button, and
 *     the button repeats the amount it will charge. Nothing is hidden and
 *     nothing is pre-checked that costs more than the visitor can see.
 *
 * Nothing here is fixed, sticky or overlaid. The card sits in the flow of the
 * page at every width — two columns on a desktop, one on a phone — so it can
 * never cover the header, the hero or the page's own content.
 *
 * Everything the card holds is an identifier, never a displayed string: the
 * destination is a project slug or a generic key, the frequency is
 * `once`/`daily`/`friday`/`monthly`. Storing a label would send Arabic text to
 * the cart from a French session the moment the labels were translated.
 *
 * The donate action adds to the basket and routes to the cart — the same path
 * as "add to basket" on a project card.
 */

const FREQUENCIES: ReadonlyArray<{ id: CartFreqKey; key: string }> = [
  { id: "once", key: "oneTime" },
  { id: "daily", key: "daily" },
  { id: "friday", key: "everyFriday" },
  { id: "monthly", key: "monthly" },
];

const AMOUNTS = [100, 300, 500, 700];
/** Index into AMOUNTS that is tagged "suggested" and selected by default. */
const SUGGESTED = 1;

/** The generic destinations that are not a single project. */
const GENERIC_DESTINATIONS = [
  { id: "where-needed", ns: "common", key: "whereNeedGreatest" },
  { id: "zakat", ns: "navigation", key: "zakat" },
  { id: "waqf", ns: "navigation", key: "waqf" },
  { id: "gaza-relief", ns: "homepage", key: "gazaReliefGroup" },
] as const;

export default function QuickDonateBar({ projects }: { projects: MinbarProject[] }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("common");
  const tHome = useTranslations("homepage");
  const tNav = useTranslations("navigation");
  const tSystem = useTranslations("system");
  const { format, symbol } = useMinbarMoney();

  const [destination, setDestination] = useState<string>("where-needed");
  const [freq, setFreq] = useState<CartFreqKey>("once");
  const [amount, setAmount] = useState<number>(AMOUNTS[SUGGESTED]);
  /** Empty string = a preset is selected; anything else = the free field is in use. */
  const [custom, setCustom] = useState<string | null>(null);

  const label = (ns: string, key: string) =>
    ns === "common" ? t(key) : ns === "navigation" ? tNav(key) : tHome(key);

  const isGeneric = GENERIC_DESTINATIONS.some((d) => d.id === destination);
  const destinationLabel = useMemo(() => {
    const g = GENERIC_DESTINATIONS.find((d) => d.id === destination);
    if (g) return label(g.ns, g.key);
    return projects.find((p) => p.slug === destination)?.title ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, projects, locale]);

  const total = custom !== null ? Number(custom || 0) : amount;
  const freqLabel = t(FREQUENCIES.find((f) => f.id === freq)?.key ?? "oneTime");
  const canGive = total > 0;

  const submit = () => {
    if (!canGive) return;
    addToCart(
      isGeneric
        ? {
            titleKey: destination === "where-needed" ? "whereNeedGreatest" : destination,
            typeKey: "project",
            freqKey: freq,
            amount: total,
            currency: "USD",
          }
        : { projectId: destination, typeKey: "project", freqKey: freq, amount: total, currency: "USD" }
    );
    router.push(miaPath("cart", locale));
  };

  return (
    <section id="quick" className="mia-qd-sec">
      <div className="mia-qd">
        <div aria-hidden="true" data-aqsa-pattern="" className="mia-qd-pattern" />

        {/* ── The choices ───────────────────────────────────────────────── */}
        <div className="mia-qd-main">
          <h2 className="mia-qd-title">
            <span aria-hidden="true" className="mia-qd-dot" />
            {tHome("quickDonateTitle")}
          </h2>

          {/* 1 — amount, the decision the donor arrives with */}
          <div className="mia-qd-field">
            <span className="mia-qd-legend" id="qd-amount">{t("amount")}</span>
            <div className="mia-qd-amounts" role="group" aria-labelledby="qd-amount">
              {AMOUNTS.map((value, i) => {
                const active = custom === null && amount === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className="mia-qd-amt"
                    data-active={active ? "true" : "false"}
                    aria-pressed={active}
                    onClick={() => { setAmount(value); setCustom(null); }}
                  >
                    <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{format(value)}</span>
                    {i === SUGGESTED ? <i className="mia-qd-tag">{t("suggestedAmount")}</i> : null}
                  </button>
                );
              })}
              <button
                type="button"
                className="mia-qd-amt mia-qd-amt--other"
                data-active={custom !== null ? "true" : "false"}
                aria-pressed={custom !== null}
                onClick={() => setCustom(custom === null ? "" : null)}
              >
                {tSystem("otherAmount")}
              </button>
            </div>

            {custom !== null ? (
              <label className="mia-qd-custom">
                <span className="mia-qd-cur" dir="ltr">{symbol}</span>
                <input
                  autoFocus
                  value={custom}
                  onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))}
                  inputMode="numeric"
                  placeholder={t("customAmount")}
                  aria-label={t("customAmount")}
                />
              </label>
            ) : null}
          </div>

          {/* 2 — where it goes: one control, generic intentions then projects */}
          <div className="mia-qd-field">
            <label className="mia-qd-legend" htmlFor="qd-destination">{tHome("projectSelectLabel")}</label>
            <div className="mia-qd-select">
              <select id="qd-destination" value={destination} onChange={(e) => setDestination(e.target.value)}>
                {GENERIC_DESTINATIONS.map((d) => (
                  <option key={d.id} value={d.id}>{label(d.ns, d.key)}</option>
                ))}
                {projects.length ? (
                  <optgroup label={tNav("projects")}>
                    {projects.map((p) => (
                      <option key={p.slug} value={p.slug}>{p.title}</option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>

          {/* 3 — how often: one setting, four states */}
          <div className="mia-qd-field">
            <span className="mia-qd-legend" id="qd-freq">{t("frequency")}</span>
            <div className="mia-qd-seg" role="group" aria-labelledby="qd-freq">
              {FREQUENCIES.map((f) => {
                const active = freq === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    data-active={active ? "true" : "false"}
                    aria-pressed={active}
                    onClick={() => setFreq(f.id)}
                  >
                    {t(f.key)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── What it adds up to ────────────────────────────────────────── */}
        <aside className="mia-qd-aside">
          <span className="mia-qd-sum-label">{t("total")}</span>
          <b className="mia-qd-sum" dir="ltr" style={{ unicodeBidi: "isolate" }}>{format(total || 0)}</b>
          <p className="mia-qd-sum-meta">
            <span>{freqLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="mia-qd-sum-dest">{destinationLabel}</span>
          </p>

          <button type="button" className="mia-qd-cta" onClick={submit} disabled={!canGive}>
            {t("donateNow")}
          </button>

          <p className="mia-qd-trust">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <span>{tSystem("secureConnection")}</span>
            <span>{t("receipt")}</span>
          </p>
        </aside>
      </div>
    </section>
  );
}
