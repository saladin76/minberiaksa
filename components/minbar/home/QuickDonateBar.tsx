"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import * as SelectPrimitive from "@radix-ui/react-select";
import { LOCALES } from "@/lib/locales";
import { miaPath } from "@/lib/minbar/routes";
import { addToCart, type CartFreqKey } from "@/lib/minbar/cart";
import { formatMoney } from "@/lib/minbar/money";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import type { MinbarProject } from "@/lib/minbar/projects";
import {
  quickTitleFor,
  resolveQuickAmounts,
  type QuickDonationConfig,
  type QuickGenericDestination,
} from "@/lib/minbar/quick-donation";
import QuickDonateFab, { type FabDestination } from "./QuickDonateFab";

/**
 * The quick-donation card under the urgent projects, and the dock that follows
 * it once it is out of sight. Everything it shows is set from the dashboard
 * (`/dashboard/quick-donation`) and arrives as `config`; see
 * `lib/minbar/quick-donation.ts` for the shape and the defaults.
 *
 * The card is a form with three inputs and a receipt, in the shape every
 * checkout already uses: the choices on one side, what they add up to on the
 * other.
 *
 *   amount → destination → frequency          |  الإجمالي  US$300
 *                                             |  شهريًا · حيث الحاجة أشد
 *                                             |  [ تبرّع الآن ]
 *
 *   · Amount first and largest. It is the decision a donor actually arrives
 *     with; the preset the dashboard marks as suggested is tagged and
 *     selected, so the card is answerable with one press.
 *   · The destination is ONE select — the generic intentions first, then the
 *     projects the dashboard allows under a group heading. It is a real
 *     listbox (Radix), keyboard-navigable, typeahead, mirrored for RTL, with
 *     the chosen row ticked — not the browser's native popup.
 *   · The frequency is one segmented control, so it reads as one setting with
 *     up to four states.
 *   · The panel restates the whole decision in words before the button.
 *
 * Money. Presets are USD and shown converted to the visitor's currency, the
 * way every figure on the site is — UNLESS the dashboard gave that currency
 * its own presets, in which case those are shown as they are and go to the
 * cart in that currency. The free field is always in the visitor's currency:
 * the symbol beside it is what they see, so that is what they give.
 *
 * The pill. Once the card is out of sight the same red quick-donate pill every
 * inner page carries takes over (`QuickDonateFab`, the handoff's
 * `التبرع السريع.dc.html`): a third of the way down the end edge on a desktop,
 * the bottom corner on a phone, opening the compact panel — destination,
 * frequency, amount, free field, one button. Earlier a bottom bar did this
 * job; the site then had two floating quick-donate controls that looked
 * nothing alike, and the bar covered the foot of every screen. The pill is
 * small, sits where a visitor already looks for it on every other page, and:
 *
 *   · appears only after the visitor has scrolled past the landing AND the
 *     card itself is not on screen — never a second copy of what is already
 *     visible, never a nag on arrival — and leaves the moment the card
 *     scrolls back into view. The dashboard can turn it off per device.
 *
 * The card and the pill are one state: a preset chosen in the panel is the
 * preset the card shows, and vice versa.
 *
 * Everything held here is an identifier, never a displayed string: the
 * destination is a project slug or a generic key, the frequency is
 * `once`/`daily`/`friday`/`monthly`. Storing a label would send Arabic text to
 * the cart from a French session the moment the labels were translated.
 *
 * The donate action adds to the basket and routes to the cart — the same path
 * as "add to basket" on a project card.
 */

const FREQ_KEY: Record<CartFreqKey, string> = {
  once: "oneTime",
  daily: "daily",
  friday: "everyFriday",
  monthly: "monthly",
};

/** The generic destinations: their i18n namespace and key. */
const GENERIC: Record<QuickGenericDestination, { ns: "common" | "navigation" | "homepage"; key: string }> = {
  "where-needed": { ns: "common", key: "whereNeedGreatest" },
  zakat: { ns: "navigation", key: "zakat" },
  waqf: { ns: "navigation", key: "waqf" },
  "gaza-relief": { ns: "homepage", key: "gazaReliefGroup" },
};

/** The pill waits until the landing has been scrolled past. */
const DOCK_AFTER_PX = 320;
/** Below this the dashboard's "phone" switch applies; above it, the "desktop" one. */
const PHONE_QUERY = "(max-width: 900px)";

export default function QuickDonateBar({ config, projects }: { config: QuickDonationConfig; projects: MinbarProject[] }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("common");
  const tHome = useTranslations("homepage");
  const tNav = useTranslations("navigation");
  const tSystem = useTranslations("system");
  const { format, currency: selectedCurrency, symbol } = useMinbarMoney();
  const dir = (LOCALES as Record<string, { direction?: "rtl" | "ltr" }>)[locale]?.direction ?? "rtl";

  /* ── What the dashboard allows ─────────────────────────────────────── */

  /** The visitor's currency code, for the free field and any preset override. */
  const visitorCode = selectedCurrency && selectedCurrency !== "DEFAULT" ? selectedCurrency : "USD";
  const presets = resolveQuickAmounts(config, visitorCode);
  const suggested = Math.min(config.suggestedIndex, presets.amounts.length - 1);

  const shownProjects = useMemo(() => {
    if (config.projectsMode === "none") return [];
    if (config.projectsMode === "all") return projects;
    const allow = new Set(config.projectIds);
    return projects.filter((p) => allow.has(p.id));
  }, [config.projectsMode, config.projectIds, projects]);

  const label = (g: QuickGenericDestination) => {
    const { ns, key } = GENERIC[g];
    return ns === "common" ? t(key) : ns === "navigation" ? tNav(key) : tHome(key);
  };

  /** The default destination as an option value: a generic id or a project slug. */
  const initialDestination = useMemo(() => {
    const d = config.defaultDestination;
    if (d && (config.genericDestinations as string[]).includes(d)) return d;
    const byId = d ? shownProjects.find((p) => p.id === d) : undefined;
    if (byId) return byId.slug;
    return config.genericDestinations[0] ?? shownProjects[0]?.slug ?? "";
  }, [config.defaultDestination, config.genericDestinations, shownProjects]);

  const title = quickTitleFor(config, locale) ?? tHome("quickDonateTitle");

  /* ── State ──────────────────────────────────────────────────────────── */

  const [destination, setDestination] = useState<string>(initialDestination);
  const [freq, setFreq] = useState<CartFreqKey>(config.defaultFrequency);
  const [amount, setAmount] = useState<number>(presets.amounts[suggested]);
  /** null = a preset is selected; a string = the free field is in use. */
  const [custom, setCustom] = useState<string | null>(null);

  /** The card is off screen and the page has been scrolled past the landing. */
  const [docked, setDocked] = useState(false);
  /** Phone-width viewport, for the per-device pill switches. */
  const [phone, setPhone] = useState(false);

  const cardRef = useRef<HTMLElement | null>(null);

  /* If the visitor changes currency to one with its own presets, the chosen
     preset may no longer exist; fall back to the suggested one. */
  useEffect(() => {
    if (custom === null && !presets.amounts.includes(amount)) setAmount(presets.amounts[suggested]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets.currency]);

  const isGeneric = (config.genericDestinations as string[]).includes(destination);
  const destinationLabel = useMemo(() => {
    if (isGeneric) return label(destination as QuickGenericDestination);
    return shownProjects.find((p) => p.slug === destination)?.title ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, shownProjects, locale]);

  /* The same options the card's select offers, flattened for the pill's
     unfolding list: intentions first, then projects under their region. */
  const fabDestinations = useMemo<FabDestination[]>(() => [
    ...config.genericDestinations.map((g) => ({ value: g, label: label(g) })),
    ...shownProjects.map((p) => ({ value: p.slug, label: p.title, group: p.regionLabel || tNav("projects") })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [config.genericDestinations, shownProjects, locale]);

  /* The total and the currency it is in — see "Money" above. */
  const total = custom !== null ? Number(custom || 0) : amount;
  const totalCurrency = custom !== null ? visitorCode : presets.currency;
  const showMoney = (value: number, code: string) => (code === "USD" ? format(value) : formatMoney(value, code, locale));
  const freqLabel = t(FREQ_KEY[freq]);
  const canGive = total > 0;

  /* ── Pill visibility ──────────────────────────────────────────────────
     Shown when the card is not in the viewport and the page is scrolled past
     the landing. Both are checked together, so scrolling back to the card
     hides the pill and scrolling to the top hides it too. */
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let cardVisible = true;
    const update = () => setDocked(!cardVisible && window.scrollY > DOCK_AFTER_PX);
    const io = new IntersectionObserver(([entry]) => { cardVisible = entry.isIntersecting; update(); }, { threshold: 0.12 });
    io.observe(el);
    window.addEventListener("scroll", update, { passive: true });

    const mq = window.matchMedia(PHONE_QUERY);
    const onMq = () => setPhone(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    return () => { io.disconnect(); window.removeEventListener("scroll", update); mq.removeEventListener("change", onMq); };
  }, []);

  const show = docked && (phone ? config.dockMobile : config.dockDesktop);

  const submit = () => {
    if (!canGive) return;
    addToCart(
      isGeneric
        ? {
            titleKey: destination === "where-needed" ? "whereNeedGreatest" : destination,
            typeKey: "project",
            freqKey: freq,
            amount: total,
            currency: totalCurrency,
          }
        : { projectId: destination, typeKey: "project", freqKey: freq, amount: total, currency: totalCurrency }
    );
    router.push(miaPath("cart", locale));
  };

  if (!config.enabled) return null;

  /* ── The destination select ───────────────────────────────────────────
     Radix in a portal, so the list is never clipped by the card or the sheet.
     The content carries `mia-scope` so the site's tokens and fonts reach it
     outside the page's own tree. */
  const destinationSelect = (id: string) => (
    <SelectPrimitive.Root value={destination} onValueChange={setDestination} dir={dir}>
      <SelectPrimitive.Trigger id={`${id}-destination`} className="mia-sel-trigger" aria-label={tHome("projectSelectLabel")}>
        <SelectPrimitive.Value>{destinationLabel}</SelectPrimitive.Value>
        <SelectPrimitive.Icon className="mia-sel-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="mia-scope mia-sel-content" dir={dir} position="popper" sideOffset={6} collisionPadding={12}>
          <SelectPrimitive.ScrollUpButton className="mia-sel-scroll" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6" /></svg>
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="mia-sel-viewport">
            {config.genericDestinations.length ? (
              <SelectPrimitive.Group>
                <SelectPrimitive.Label className="mia-sel-group">{tHome("projectSelectLabel")}</SelectPrimitive.Label>
                {config.genericDestinations.map((g) => (
                  <SelectPrimitive.Item key={g} value={g} className="mia-sel-item">
                    <SelectPrimitive.ItemText>{label(g)}</SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator className="mia-sel-check">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Group>
            ) : null}
            {shownProjects.length ? (
              <SelectPrimitive.Group>
                <SelectPrimitive.Label className="mia-sel-group">{tNav("projects")}</SelectPrimitive.Label>
                {shownProjects.map((p) => (
                  <SelectPrimitive.Item key={p.slug} value={p.slug} className="mia-sel-item">
                    <SelectPrimitive.ItemText>{p.title}</SelectPrimitive.ItemText>
                    {p.regionLabel ? <span className="mia-sel-meta" aria-hidden="true">{p.regionLabel}</span> : null}
                    <SelectPrimitive.ItemIndicator className="mia-sel-check">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Group>
            ) : null}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="mia-sel-scroll" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );

  /* ── The inputs, rendered by the card and again by the phone sheet.
     `id` keeps the label/aria ids unique between the two copies; `live` is the
     copy the visitor is looking at, the only one that takes focus. */
  const fields = (id: string, live: boolean) => (
    <>
      {/* 1 — amount, the decision the donor arrives with */}
      <div className="mia-qd-field">
        <span className="mia-qd-legend" id={`${id}-amount`}>{t("amount")}</span>
        <div
          className="mia-qd-amounts"
          role="group"
          aria-labelledby={`${id}-amount`}
          data-count={presets.amounts.length}
          style={{ "--n": presets.amounts.length } as React.CSSProperties}
        >
          {presets.amounts.map((value, i) => {
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
                <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{showMoney(value, presets.currency)}</span>
                {i === suggested ? <i className="mia-qd-tag">{t("suggestedAmount")}</i> : null}
              </button>
            );
          })}
          {config.allowCustomAmount ? (
            <button
              type="button"
              className="mia-qd-amt mia-qd-amt--other"
              data-active={custom !== null ? "true" : "false"}
              aria-pressed={custom !== null}
              onClick={() => setCustom(custom === null ? "" : null)}
            >
              {tSystem("otherAmount")}
            </button>
          ) : null}
        </div>

        {custom !== null ? (
          <label className="mia-qd-custom">
            <span className="mia-qd-cur" dir="ltr">{symbol}</span>
            <input
              autoFocus={live}
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
      {config.genericDestinations.length + shownProjects.length > 1 ? (
        <div className="mia-qd-field">
          <label className="mia-qd-legend" htmlFor={`${id}-destination`}>{tHome("projectSelectLabel")}</label>
          {destinationSelect(id)}
        </div>
      ) : null}

      {/* 3 — how often: one setting, up to four states */}
      {config.frequencies.length > 1 ? (
        <div className="mia-qd-field">
          <span className="mia-qd-legend" id={`${id}-freq`}>{t("frequency")}</span>
          <div className="mia-qd-seg" role="group" aria-labelledby={`${id}-freq`} data-count={config.frequencies.length}>
            {config.frequencies.map((f) => {
              const active = freq === f;
              return (
                <button
                  key={f}
                  type="button"
                  data-active={active ? "true" : "false"}
                  aria-pressed={active}
                  onClick={() => setFreq(f)}
                >
                  {t(FREQ_KEY[f])}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );

  const trust = (
    <p className="mia-qd-trust">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      <span>{tSystem("secureConnection")}</span>
      <span>{t("receipt")}</span>
    </p>
  );

  const totalText = showMoney(total || 0, totalCurrency);

  return (
    <>
      <section id="quick" ref={cardRef} className="mia-qd-sec">
        <div className="mia-qd">
          <div aria-hidden="true" data-aqsa-pattern="" className="mia-qd-pattern" />

          {/* ── The choices ─────────────────────────────────────────────── */}
          <div className="mia-qd-main">
            <h2 className="mia-qd-title">
              <span aria-hidden="true" className="mia-qd-dot" />
              {title}
            </h2>
            {fields("qd", true)}
          </div>

          {/* ── What it adds up to ──────────────────────────────────────── */}
          <aside className="mia-qd-aside">
            <span className="mia-qd-sum-label">{t("total")}</span>
            <b className="mia-qd-sum" style={{ unicodeBidi: "isolate" }}>{totalText}</b>
            <p className="mia-qd-sum-meta">
              <span>{freqLabel}</span>
              {destinationLabel ? <><span aria-hidden="true">·</span><span className="mia-qd-sum-dest">{destinationLabel}</span></> : null}
            </p>

            <button type="button" className="mia-qd-cta" onClick={submit} disabled={!canGive}>
              {t("donateNow")}
            </button>

            {trust}
          </aside>
        </div>
      </section>

      {/* ── The pill: the card's controls, within reach once the card is not. */}
      {show ? (
        <QuickDonateFab
          dir={dir}
          labels={{
            pill: t("quickDonate"),
            destination: tHome("projectSelectLabel"),
            frequency: t("frequency"),
            amount: t("amount"),
            customAmount: t("customAmount"),
            submit: t("donateNow"),
            freq: { once: t(FREQ_KEY.once), daily: t(FREQ_KEY.daily), friday: t(FREQ_KEY.friday), monthly: t(FREQ_KEY.monthly) },
          }}
          destinations={fabDestinations}
          destination={destination}
          onDestination={setDestination}
          frequencies={config.frequencies}
          freq={freq}
          onFreq={setFreq}
          amounts={presets.amounts.map((value) => ({ value, text: showMoney(value, presets.currency) }))}
          amountCurrency={presets.currency}
          amount={amount}
          custom={custom}
          onAmount={(value) => { setAmount(value); setCustom(null); }}
          onCustom={(value) => setCustom(value === "" && custom === null ? null : value)}
          allowCustom={config.allowCustomAmount}
          customSymbol={symbol}
          canGive={canGive}
          onSubmit={submit}
        />
      ) : null}
    </>
  );
}
