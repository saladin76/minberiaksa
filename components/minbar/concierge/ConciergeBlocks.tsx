"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import type { CampaignCard, ConciergeAction, ConciergeBlock } from "@/lib/ai/concierge/schema";
import type { CartFreqKey, CartGiftDetails } from "@/lib/minbar/cart";
import type { AddInput, WaqfAddInput } from "./useConcierge";

/**
 * Renderers for the typed blocks the concierge returns. Nothing here is
 * model-authored markup: every card is built from a validated block and the
 * only free text is the model's short "why" line, rendered as text.
 */

const FREQ_KEYS: Record<CartFreqKey, string> = { once: "freqOnce", daily: "freqDaily", friday: "freqFriday", monthly: "freqMonthly" };

interface BlockProps {
  block: ConciergeBlock;
  onAction: (action: ConciergeAction, label?: string) => void;
  onAdd: (input: AddInput) => void;
  onAddWaqf: (input: WaqfAddInput) => void;
  busy: boolean;
}

export function Block(props: BlockProps) {
  const { block } = props;
  switch (block.type) {
    case "campaign_recommendations":
      return (
        <div className="cg-cards">
          {block.campaigns.map((c) => (
            <CampaignRow key={c.id} campaign={c} onAction={props.onAction} busy={props.busy} />
          ))}
        </div>
      );
    case "category_options":
      return <CategoryList categories={block.categories} onAction={props.onAction} busy={props.busy} />;
    case "donation_configuration":
      return <Configurator block={block} onAdd={props.onAdd} onAction={props.onAction} busy={props.busy} />;
    case "waqf_options":
      return <WaqfForm units={block.units} onAddWaqf={props.onAddWaqf} busy={props.busy} />;
    case "zakat_card":
      return <ZakatCard />;
    case "cart_confirmation":
      return <Confirmation title={block.title} amountUSD={block.amountUSD} frequency={block.frequency} />;
    case "cross_sell":
      return <CrossSell campaign={block.campaign} amounts={block.suggestedAmountsUSD} onAdd={props.onAdd} onAction={props.onAction} busy={props.busy} />;
    case "notice":
      return <p className={`cg-notice cg-notice-${block.tone}`}>{block.text}</p>;
    case "donor_summary":
      return <DonorSummary block={block} onAction={props.onAction} />;
    case "suggestion":
      return <Suggestion block={block} onAction={props.onAction} busy={props.busy} />;
  }
}

/** One next step with OK / no thanks; declining simply folds it away. */
function Suggestion({ block, onAction, busy }: { block: Extract<ConciergeBlock, { type: "suggestion" }>; onAction: BlockProps["onAction"]; busy: boolean }) {
  const t = useTranslations("Concierge");
  const [dismissed, setDismissed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  if (dismissed) return null;
  return (
    <div className="cg-suggest">
      {block.campaign?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.campaign.image} alt="" className="cg-config-img" loading="lazy" />
      ) : null}
      <div className="cg-suggest-body">
        <p className="cg-suggest-text">{block.text}</p>
        {block.campaign ? <span className="cg-card-meta">{block.campaign.title}{block.campaign.regionLabel ? ` · ${block.campaign.regionLabel}` : ""}</span> : null}
        <div className="cg-suggest-actions">
          <button
            type="button"
            className="cg-btn cg-btn-primary"
            disabled={busy || accepted}
            onClick={() => {
              setAccepted(true);
              onAction(block.accept, block.accept.label);
            }}
          >
            {t("a_ok")}
          </button>
          <button type="button" className="cg-link" disabled={accepted} onClick={() => setDismissed(true)}>
            {t("a_no")}
          </button>
        </div>
      </div>
    </div>
  );
}

const FREQ_PLAN_KEYS: Record<"DAILY" | "FRIDAY" | "MONTHLY", string> = { DAILY: "freqDaily", FRIDAY: "freqFriday", MONTHLY: "freqMonthly" };

function DonorSummary({ block, onAction }: { block: Extract<ConciergeBlock, { type: "donor_summary" }>; onAction: BlockProps["onAction"] }) {
  const t = useTranslations("Concierge");
  const tCommon = useTranslations("common");
  const { format, formatNumber } = useMinbarMoney();
  const money = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  };
  return (
    <div className="cg-config cg-donor">
      <div className="cg-donor-totals">
        <span className="cg-label">{t("d_total")}</span>
        <b dir="ltr">{format(block.totals.paidUSD)}</b>
        <span className="cg-hint">{t("d_donations", { count: formatNumber(block.totals.donations) })}</span>
      </div>
      {block.plans.length ? (
        <>
          <span className="cg-label">{t("d_plans")}</span>
          {block.plans.map((p) => (
            <div key={p.id} className="cg-donor-row">
              <div>
                <b>
                  <span dir="ltr">{money(p.amount, p.currency)}</span> · {tCommon(FREQ_PLAN_KEYS[p.frequency])}
                </b>
                <span>{p.items.join("، ") || tCommon("whereNeedGreatest")}</span>
                <span className={`cg-state cg-state-${p.status === "ACTIVE" ? "ok" : "warn"}`}>
                  {t(`ps_${p.status}`)}
                  {p.nextBillingDate && p.status === "ACTIVE" ? ` · ${t("n_next_charge", { date: p.nextBillingDate })}` : ""}
                </span>
              </div>
            </div>
          ))}
        </>
      ) : null}
      {block.donations.length ? (
        <>
          <span className="cg-label">{t("d_recent")}</span>
          {block.donations.map((d) => (
            <div key={d.id} className="cg-donor-row">
              <div>
                <b>
                  <span dir="ltr">{money(d.amount, d.currency)}</span> · <span dir="ltr">{d.date}</span>
                </b>
                <span>{d.items.join("، ") || tCommon("whereNeedGreatest")}</span>
                <span className={`cg-state cg-state-${d.state === "paid" ? "ok" : d.state === "failed" || d.state === "rejected" ? "bad" : "warn"}`}>{t(`st_${d.state}`)}</span>
              </div>
              <div className="cg-donor-actions">
                {d.documentsReady ? (
                  <>
                    <button type="button" className="cg-link" onClick={() => onAction({ type: "navigate", label: t("a_receipt"), route: "receipt", extra: [d.id] })}>{t("a_receipt")}</button>
                    <button type="button" className="cg-link" onClick={() => onAction({ type: "navigate", label: t("a_certificate"), route: "thanksCertificate", extra: [d.id] })}>{t("a_certificate")}</button>
                  </>
                ) : d.state === "awaiting_receipt" || d.state === "under_review" || d.state === "rejected" ? (
                  <button type="button" className="cg-link" onClick={() => onAction({ type: "navigate", label: t("a_payment_pending"), route: "paymentPending", extra: [d.id] })}>{t("a_payment_pending")}</button>
                ) : null}
              </div>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

function CampaignRow({ campaign, onAction, busy }: { campaign: CampaignCard; onAction: BlockProps["onAction"]; busy: boolean }) {
  const t = useTranslations("Concierge");
  const { format } = useMinbarMoney();
  return (
    <article className="cg-card">
      {campaign.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={campaign.image} alt="" className="cg-card-img" loading="lazy" />
      ) : (
        <span className="cg-card-img cg-card-img-empty" aria-hidden="true" />
      )}
      <div className="cg-card-body">
        <b className="cg-card-title">{campaign.title}</b>
        {campaign.regionLabel ? <span className="cg-card-meta">{campaign.regionLabel}</span> : null}
        {campaign.summary ? <p className="cg-card-text">{campaign.summary}</p> : null}
        {campaign.why ? <p className="cg-card-why">{campaign.why}</p> : null}
        <span className="cg-card-facts">
          {campaign.goalUSD ? t("raised", { amount: format(campaign.raisedUSD) }) : campaign.raisedUSD > 0 ? t("raised", { amount: format(campaign.raisedUSD) }) : t("openEnded")}
          {campaign.supportsShares && campaign.sharePriceUSD ? ` · ${t("shares", { price: format(campaign.sharePriceUSD) })}` : ""}
        </span>
        <div className="cg-card-actions">
          <button type="button" className="cg-btn cg-btn-primary" disabled={busy} onClick={() => onAction({ type: "select_campaign", label: t("choose"), campaignId: campaign.id }, `${t("choose")}: ${campaign.title}`)}>
            {t("choose")}
          </button>
          <button type="button" className="cg-btn cg-btn-light" disabled={busy} onClick={() => onAction({ type: "navigate", label: t("a_view"), route: "projectDetail", extra: [campaign.slug], track: "campaign_viewed" })}>
            {t("a_view")}
          </button>
        </div>
      </div>
    </article>
  );
}

function CategoryList({ categories, onAction, busy }: { categories: Extract<ConciergeBlock, { type: "category_options" }>["categories"]; onAction: BlockProps["onAction"]; busy: boolean }) {
  return (
    <div className="cg-chips">
      {categories.map((c) => (
        <button key={c.id} type="button" className="cg-chip" disabled={busy} onClick={() => onAction({ type: "select_category", label: c.title, categoryId: c.id }, c.title)}>
          {c.title}
          {c.projectCount ? <span className="cg-chip-count">{c.projectCount}</span> : null}
        </button>
      ))}
    </div>
  );
}

function Configurator({ block, onAdd, onAction, busy }: { block: Extract<ConciergeBlock, { type: "donation_configuration" }>; onAdd: BlockProps["onAdd"]; onAction: BlockProps["onAction"]; busy: boolean }) {
  const t = useTranslations("Concierge");
  const tCommon = useTranslations("common");
  const { format } = useMinbarMoney();
  const [amount, setAmount] = useState<number>(block.presetAmountUSD ?? block.suggestedAmountsUSD[0]);
  const [custom, setCustom] = useState(block.presetAmountUSD && !block.suggestedAmountsUSD.includes(block.presetAmountUSD) ? String(block.presetAmountUSD) : "");
  const [freq, setFreq] = useState<CartFreqKey>(block.presetFrequency ?? "once");
  const [gift, setGift] = useState(Boolean(block.giftRecipientName));
  const [giftName, setGiftName] = useState(block.giftRecipientName ?? "");
  const [giftEmail, setGiftEmail] = useState("");
  const [giftPhone, setGiftPhone] = useState("");
  const [done, setDone] = useState(false);

  const value = Number(custom) > 0 ? Number(custom) : amount;
  const giftReady = !gift || giftName.trim().length > 0;
  const title = block.campaign?.title ?? block.category?.title ?? (block.genericTitleKey ? tCommon(block.genericTitleKey) : "");

  const submit = () => {
    if (!(value > 0) || !giftReady || done) return;
    const giftDetails: CartGiftDetails | null = gift
      ? {
          recipientName: giftName.trim(),
          recipientPhone: giftPhone.trim(),
          recipientEmail: giftEmail.trim(),
          message: "",
          channels: [...(giftPhone.trim() ? (["whatsapp"] as const) : []), ...(giftEmail.trim() ? (["email"] as const) : [])],
          showAmount: true,
        }
      : null;
    setDone(true);
    onAdd({
      campaign: block.campaign ? { id: block.campaign.id, slug: block.campaign.slug, title: block.campaign.title } : null,
      category: block.category ? { id: block.category.id, title: block.category.title } : null,
      genericTitleKey: block.genericTitleKey,
      typeKey: block.typeKey,
      amountUSD: Math.round(value * 100) / 100,
      frequency: freq,
      gift: giftDetails,
    });
  };

  return (
    <div className="cg-config">
      <div className="cg-config-head">
        {block.campaign?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={block.campaign.image} alt="" className="cg-config-img" loading="lazy" />
        ) : null}
        <div>
          <b className="cg-card-title">{title}</b>
          {block.campaign?.regionLabel ? <span className="cg-card-meta">{block.campaign.regionLabel}</span> : null}
        </div>
        {block.campaign ? (
          <button type="button" className="cg-link" onClick={() => onAction({ type: "navigate", label: t("a_view"), route: "projectDetail", extra: [block.campaign!.slug], track: "campaign_viewed" })}>
            {t("a_view")}
          </button>
        ) : null}
      </div>

      <span className="cg-label">{t("amountLabel")}</span>
      <div className="cg-chips">
        {block.suggestedAmountsUSD.map((v) => (
          <button key={v} type="button" className="cg-chip" data-on={!custom && amount === v ? "1" : ""} disabled={done} onClick={() => { setAmount(v); setCustom(""); }}>
            <span dir="ltr">{format(v)}</span>
          </button>
        ))}
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          dir="ltr"
          placeholder={tCommon("customAmount")}
          aria-label={tCommon("customAmount")}
          className="cg-input cg-input-amount"
          disabled={done}
        />
      </div>
      {custom ? <span className="cg-hint" dir="ltr">≈ USD {custom}</span> : null}

      {block.frequencies.length > 1 ? (
        <>
          <span className="cg-label">{tCommon("frequency")}</span>
          <div className="cg-chips">
            {block.frequencies.map((f) => (
              <button key={f} type="button" className="cg-chip" data-on={freq === f ? "1" : ""} disabled={done} onClick={() => setFreq(f)}>
                {tCommon(FREQ_KEYS[f])}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {block.allowGift ? (
        <label className="cg-toggle">
          <input type="checkbox" checked={gift} onChange={(e) => setGift(e.target.checked)} disabled={done} />
          <span>{t("giftToggle")}</span>
        </label>
      ) : null}
      {gift ? (
        <div className="cg-gift">
          <input value={giftName} onChange={(e) => setGiftName(e.target.value)} placeholder={t("giftName")} aria-label={t("giftName")} className="cg-input" disabled={done} />
          <input value={giftEmail} onChange={(e) => setGiftEmail(e.target.value)} placeholder={t("giftEmail")} aria-label={t("giftEmail")} className="cg-input" inputMode="email" dir="ltr" disabled={done} />
          <input value={giftPhone} onChange={(e) => setGiftPhone(e.target.value)} placeholder={t("giftPhone")} aria-label={t("giftPhone")} className="cg-input" inputMode="tel" dir="ltr" disabled={done} />
        </div>
      ) : null}

      <button type="button" className="cg-btn cg-btn-primary cg-btn-full" disabled={busy || done || !(value > 0) || !giftReady} onClick={submit}>
        {t("addToBasket")} · <span dir="ltr">{format(value)}</span>
        {freq !== "once" ? <span className="cg-btn-sub">{t("perInstalment")}</span> : null}
      </button>
    </div>
  );
}

function WaqfForm({ units, onAddWaqf, busy }: { units: Extract<ConciergeBlock, { type: "waqf_options" }>["units"]; onAddWaqf: BlockProps["onAddWaqf"]; busy: boolean }) {
  const t = useTranslations("Concierge");
  const { format } = useMinbarMoney();
  const [unit, setUnit] = useState<"share" | "meter">(units[0]?.unit ?? "share");
  const [count, setCount] = useState(1);
  const [donorName, setDonorName] = useState("");
  const [onBehalf, setOnBehalf] = useState("");
  const [done, setDone] = useState(false);
  const chosen = units.find((u) => u.unit === unit) ?? units[0];
  const ready = donorName.trim().length > 0 && onBehalf.trim().length > 0 && count >= 1 && Boolean(chosen);
  return (
    <div className="cg-config">
      <div className="cg-chips">
        {units.map((u) => (
          <button key={u.unit} type="button" className="cg-chip" data-on={unit === u.unit ? "1" : ""} disabled={done} onClick={() => setUnit(u.unit)}>
            {u.unit === "meter" ? t("unitMeter") : t("unitShare")} · <span dir="ltr">{format(u.priceUSD)}</span>
          </button>
        ))}
      </div>
      <div className="cg-row">
        <label className="cg-label" htmlFor="cg-waqf-count">{t("count")}</label>
        <input id="cg-waqf-count" type="number" min={1} max={999} value={count} onChange={(e) => setCount(Math.max(1, Math.min(999, Math.floor(Number(e.target.value) || 1))))} className="cg-input cg-input-amount" dir="ltr" disabled={done} />
      </div>
      <input value={donorName} onChange={(e) => setDonorName(e.target.value)} placeholder={t("waqfDonorName")} aria-label={t("waqfDonorName")} className="cg-input" disabled={done} />
      <input value={onBehalf} onChange={(e) => setOnBehalf(e.target.value)} placeholder={t("waqfOnBehalf")} aria-label={t("waqfOnBehalf")} className="cg-input" disabled={done} />
      <button
        type="button"
        className="cg-btn cg-btn-primary cg-btn-full"
        disabled={busy || done || !ready}
        onClick={() => {
          if (!chosen) return;
          setDone(true);
          onAddWaqf({ unit, count, donorName, onBehalf, priceUSD: chosen.priceUSD, monthly: false });
        }}
      >
        {t("addToBasket")} · <span dir="ltr">{format((chosen?.priceUSD ?? 0) * count)}</span>
      </button>
    </div>
  );
}

function ZakatCard() {
  const t = useTranslations("Concierge");
  return <p className="cg-notice cg-notice-info">{t("zakatNote")}</p>;
}

function Confirmation({ title, amountUSD, frequency }: { title: string; amountUSD: number; frequency: CartFreqKey }) {
  const t = useTranslations("Concierge");
  const tCommon = useTranslations("common");
  const { format } = useMinbarMoney();
  return (
    <div className="cg-confirm" role="status">
      <span className="cg-confirm-check" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <div>
        <b>{t("inBasket")}</b>
        <span>
          {title} · <span dir="ltr">{format(amountUSD)}</span> · {tCommon(FREQ_KEYS[frequency])}
        </span>
      </div>
    </div>
  );
}

function CrossSell({ campaign, amounts, onAdd, onAction, busy }: { campaign: CampaignCard; amounts: number[]; onAdd: BlockProps["onAdd"]; onAction: BlockProps["onAction"]; busy: boolean }) {
  const t = useTranslations("Concierge");
  const { format } = useMinbarMoney();
  const [done, setDone] = useState(false);
  return (
    <div className="cg-cross">
      <b className="cg-cross-title">{t("crossSellTitle")}</b>
      <div className="cg-cross-body">
        {campaign.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={campaign.image} alt="" className="cg-config-img" loading="lazy" />
        ) : null}
        <div>
          <b className="cg-card-title">{campaign.title}</b>
          {campaign.why ? <p className="cg-card-why">{campaign.why}</p> : null}
        </div>
      </div>
      <div className="cg-chips">
        {amounts.map((v) => (
          <button
            key={v}
            type="button"
            className="cg-chip"
            disabled={busy || done}
            onClick={() => {
              setDone(true);
              onAdd({ campaign: { id: campaign.id, slug: campaign.slug, title: campaign.title }, category: null, genericTitleKey: null, typeKey: "project", amountUSD: v, frequency: "once", gift: null });
            }}
          >
            + <span dir="ltr">{format(v)}</span>
          </button>
        ))}
        <button type="button" className="cg-link" onClick={() => onAction({ type: "navigate", label: t("a_view"), route: "projectDetail", extra: [campaign.slug], track: "campaign_viewed" })}>
          {t("a_view")}
        </button>
      </div>
    </div>
  );
}
