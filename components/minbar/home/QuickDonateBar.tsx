"use client";

import { useEffect, useMemo, useState } from "react";
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
  resolveQuickAmounts,
  type QuickDonationConfig,
  type QuickGenericDestination,
} from "@/lib/minbar/quick-donation";

/**
 * The quick-donation bar under the hero — `#quick` in
 * `Minbar/الصفحة الرئيسية.dc.html`. Everything it offers is set from the
 * dashboard (`/dashboard/quick-donation`) and arrives as `config`; see
 * `lib/minbar/quick-donation.ts` for the shape and the defaults.
 *
 * Desktop: one row, sticky under the header, so the choice travels with the
 * visitor down the page:
 *
 *   [ destination ▾ ] | تبرع لمرة  يوميًا  كل جمعة  شهريًا | $100 $300 $500 $700 [مبلغ مخصص] … US$300 [ تبرّع الآن ]
 *
 *   · The destination is ONE select — the generic intentions first, then the
 *     projects the dashboard allows under a group heading. A real listbox
 *     (Radix), keyboard-navigable, mirrored for RTL, styled as a pill here.
 *   · Frequency and amount are chips. A chosen frequency lights gold, a chosen
 *     amount lights deep — the design's two accents, so the two settings read
 *     apart at a glance. The free field sits at the end of the amounts.
 *   · The total sits before the button; the button fills the bar's height and
 *     is flush with its end edge.
 *
 * Phone (≤960px, in CSS): the same choices as a sheet fixed to the bottom of
 * the screen, collapsed to one row — chevron · «التبرع السريع» + total · button
 * — until the chevron opens it. Pressing the button while it is collapsed
 * opens it first, so nobody gives $100 to "where needed" without having seen
 * that this is what they chose.
 *
 * Money. Presets are USD and shown converted to the visitor's currency, the
 * way every figure on the site is — UNLESS the dashboard gave that currency
 * its own presets, in which case those are shown as they are and go to the
 * cart in that currency. The free field is always in the visitor's currency:
 * the symbol beside it is what they see, so that is what they give.
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

/** Below this the bar is the bottom sheet (must match the CSS breakpoint). */
const PHONE_QUERY = "(max-width: 960px)";

const Chevron = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 15 6-6 6 6" />
  </svg>
);

export default function QuickDonateBar({ config, projects }: { config: QuickDonationConfig; projects: MinbarProject[] }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("common");
  const tHome = useTranslations("homepage");
  const tNav = useTranslations("navigation");
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

  /* ── State ──────────────────────────────────────────────────────────── */

  const [destination, setDestination] = useState<string>(initialDestination);
  const [freq, setFreq] = useState<CartFreqKey>(config.defaultFrequency);
  const [amount, setAmount] = useState<number>(presets.amounts[suggested]);
  /** "" = a preset is selected; digits = the free field is in use. */
  const [custom, setCustom] = useState("");
  /** The phone sheet: collapsed until the chevron (or a premature "donate") opens it. */
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);

  /* If the visitor changes currency to one with its own presets, the chosen
     preset may no longer exist; fall back to the suggested one. */
  useEffect(() => {
    if (!custom && !presets.amounts.includes(amount)) setAmount(presets.amounts[suggested]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets.currency]);

  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const onMq = () => setPhone(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  const isGeneric = (config.genericDestinations as string[]).includes(destination);
  const destinationLabel = useMemo(() => {
    if (isGeneric) return label(destination as QuickGenericDestination);
    return shownProjects.find((p) => p.slug === destination)?.title ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, shownProjects, locale]);

  /* The total and the currency it is in — see "Money" above. */
  const total = custom ? Number(custom) : amount;
  const totalCurrency = custom ? visitorCode : presets.currency;
  const showMoney = (value: number, code: string) => (code === "USD" ? format(value) : formatMoney(value, code, locale));
  const totalText = showMoney(total || 0, totalCurrency);
  const canGive = total > 0;

  const submit = () => {
    // Collapsed sheet: show the choice before acting on it.
    if (phone && !open) { setOpen(true); return; }
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

  const hasDestinations = config.genericDestinations.length + shownProjects.length > 1;
  const hasFrequencies = config.frequencies.length > 1;

  /* ── The destination select ───────────────────────────────────────────
     Radix in a portal, so the list is never clipped by the bar (which clips
     its own overflow) or the sheet. The content carries `mia-scope` so the
     site's tokens and fonts reach it outside the page's own tree. */
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

  /* ── The chips, rendered by the bar and again by the sheet.
     `id` keeps the aria ids unique between the two copies. */
  const frequencyChips = (id: string) => (
    <div className="mia-qb-chips" role="group" aria-label={t("frequency")} id={`${id}-freq`}>
      {config.frequencies.map((f) => (
        <button
          key={f}
          type="button"
          className="mia-qb-chip"
          data-chip={freq === f ? "freq" : ""}
          aria-pressed={freq === f}
          onClick={() => setFreq(f)}
        >
          {t(FREQ_KEY[f])}
        </button>
      ))}
    </div>
  );

  const amountChips = (id: string) => (
    <div className="mia-qb-chips" role="group" aria-label={t("amount")} id={`${id}-amount`}>
      {presets.amounts.map((value) => {
        const active = !custom && amount === value;
        return (
          <button
            key={value}
            type="button"
            className="mia-qb-chip"
            data-chip={active ? "amt" : ""}
            aria-pressed={active}
            onClick={() => { setAmount(value); setCustom(""); }}
          >
            <span dir="ltr">{showMoney(value, presets.currency)}</span>
          </button>
        );
      })}
      {config.allowCustomAmount ? (
        <label className="mia-qb-free" data-active={custom ? "true" : "false"}>
          <small dir="ltr">{symbol}</small>
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))}
            inputMode="numeric"
            placeholder={t("freeAmount")}
            aria-label={t("freeAmount")}
          />
        </label>
      ) : null}
    </div>
  );

  return (
    <section id="quick" className="mia-qb-sec" data-open={open ? "true" : "false"}>
      <div className="mia-qb-wrap">
        {/* ── Desktop: one row ─────────────────────────────────────────── */}
        <div className="mia-qb-desk">
          <div aria-hidden="true" data-aqsa-pattern="" className="mia-qb-pattern" />
          <span aria-hidden="true" className="mia-qb-rail" />
          <span aria-hidden="true" className="mia-qb-gems mia-qb-gems--top"><i /><i /></span>
          <span aria-hidden="true" className="mia-qb-gems mia-qb-gems--bottom"><i /><i /></span>

          {hasDestinations ? (
            <>
              {destinationSelect("qb")}
              <span aria-hidden="true" className="mia-qb-div" />
            </>
          ) : null}
          {hasFrequencies ? (
            <>
              {frequencyChips("qb")}
              <span aria-hidden="true" className="mia-qb-div" />
            </>
          ) : null}
          {amountChips("qb")}

          <div className="mia-qb-end">
            <span aria-hidden="true" className="mia-qb-div" />
            <b className="mia-qb-total" dir="ltr">{totalText}</b>
            <button type="button" className="mia-qb-cta" onClick={submit} disabled={!canGive}>
              {t("donateNow")}
            </button>
          </div>
        </div>

        {/* ── Phone: a bottom sheet, collapsed to its last row ─────────── */}
        <div className="mia-qb-sheet">
          <div className="mia-qb-body" id="qbm-body">
            <span aria-hidden="true" className="mia-qb-handle" />
            {hasDestinations ? (
              <div className="mia-qb-group">
                <b>{tHome("projectSelectLabel")}</b>
                {destinationSelect("qbm")}
              </div>
            ) : null}
            {hasFrequencies ? (
              <div className="mia-qb-group">
                <b>{t("frequency")}</b>
                {frequencyChips("qbm")}
              </div>
            ) : null}
            <div className="mia-qb-group">
              <b>{t("amount")}</b>
              {amountChips("qbm")}
            </div>
          </div>
          <div className="mia-qb-bar">
            <button
              type="button"
              className="mia-qb-toggle"
              aria-label={t("quickDonate")}
              aria-expanded={open}
              aria-controls="qbm-body"
              onClick={() => setOpen((v) => !v)}
            >
              <Chevron />
            </button>
            <span className="mia-qb-sum">
              <span>{t("quickDonate")}</span>
              <b dir="ltr">{totalText}</b>
            </span>
            <button type="button" className="mia-qb-cta" onClick={submit} disabled={open && !canGive}>
              {t("donateNow")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
