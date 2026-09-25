import "server-only";

import { messagesFor } from "@/i18n/locale-messages";
import { convertAmountInCurrencyToUsd, normalizeDonationCurrencyCode } from "@/lib/exchange/convert-amount-in-currency-to-usd";
import { DEFAULT_SUGGESTED_DONATION_AMOUNTS } from "@/lib/campaign/suggested-donations";
import { loadCatalog, type ConciergeCatalog } from "./catalog";
import { bareWish, mentionsCurrentPage, parseCommand, parseMessage, wantsToDonate } from "./intent";
import { LOCALES, isValidLocale } from "@/lib/locales";
import { SUPPORTED_CURRENCY_CODES } from "@/lib/supported-currencies";
import { askModel } from "./llm";
import { loadKnowledge } from "./knowledge";
import { loadDonorContext, type DonorContext } from "./donor";
import { resolveTopic, pickCrossSell, rankCampaigns, rankCategories, type CatalogCampaign, type CatalogCategory } from "./recommend";
import {
  FREQUENCIES,
  type CampaignCard,
  type CategoryCard,
  type ConciergeAction,
  type ConciergeBlock,
  type ConciergeIntent,
  type ConciergeRequest,
  type ConciergeResponse,
  type ConversationState,
} from "./schema";

/**
 * The concierge's brain: one request in, one typed response out.
 *
 * Everything that can be answered without a model is answered without one —
 * the welcome screen, every quick-intent chip, choosing a campaign, "show me
 * another", and the post-add confirmation are all deterministic. The model is
 * consulted only for free text, and even then it only chooses among the
 * candidates this file selected and phrases the reply; the blocks are built
 * here from catalog facts.
 */

type Strings = Record<string, string>;

function stringsFor(locale: string): Strings {
  const ns = messagesFor(locale).Concierge;
  return ns && typeof ns === "object" ? (ns as Strings) : {};
}

function fill(template: string | undefined, vars: Record<string, string | number>): string {
  return (template ?? "").replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

function fmtUsd(locale: string, amount: number): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `$${Math.round(amount)}`;
  }
}

function toCard(c: CatalogCampaign, why: string | null): CampaignCard {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    summary: c.summary,
    image: c.image,
    regionLabel: c.regionLabel,
    why,
    raisedUSD: c.raisedUSD,
    goalUSD: c.goalUSD,
    suggestedAmountsUSD: c.suggestedAmountsUSD,
    supportsShares: c.supportsShares,
    sharePriceUSD: c.sharePriceUSD,
  };
}

function toCategoryCard(c: CatalogCategory): CategoryCard {
  return { id: c.id, slug: c.slug, title: c.title, kind: c.kind, projectCount: c.projectCount, canDonateDirectly: c.canDonateDirectly };
}

/** A factual, templated reason: region, waqf/recurring tags, share price. */
function templateWhy(s: Strings, locale: string, c: CatalogCampaign, intent: ConciergeIntent | null): string | null {
  const bits: string[] = [];
  if (intent === "sadaqah_jariyah" && c.categorySlugs.includes("type-waqf")) bits.push(s.why_waqf ?? "");
  if (intent === "recurring" && c.categorySlugs.includes("type-recurring")) bits.push(s.why_recurring ?? "");
  if (c.regionLabel) bits.push(fill(s.why_region, { region: c.regionLabel }));
  if (c.supportsShares && c.sharePriceUSD) bits.push(fill(s.why_shares, { price: fmtUsd(locale, c.sharePriceUSD) }));
  const text = bits.filter(Boolean).join(" · ");
  return text || null;
}

function amountsFor(c: CatalogCampaign | null, preset: number | null): number[] {
  const base = c?.suggestedAmountsUSD.length ? c.suggestedAmountsUSD : [...DEFAULT_SUGGESTED_DONATION_AMOUNTS];
  if (preset && !base.includes(preset)) return [...base, preset].sort((a, b) => a - b).slice(0, 8);
  return base;
}

function chips(s: Strings): ConciergeAction[] {
  return [
    { type: "intent", label: s.c_sadaqah ?? "", intent: "sadaqah_jariyah" },
    { type: "intent", label: s.c_relief ?? "", intent: "relief" },
    { type: "intent", label: s.c_zakat ?? "", intent: "zakat" },
    { type: "intent", label: s.c_waqf ?? "", intent: "waqf" },
    { type: "intent", label: s.c_recurring ?? "", intent: "recurring" },
    { type: "intent", label: s.c_explore ?? "", intent: "explore" },
  ];
}

/** How many turns a stated amount keeps presetting the configurator — long
    enough to browse areas, "show me another" a few times and then pick. */
const AMOUNT_MEMORY_TURNS = 8;

/**
 * The amount the visitor stated, while it is still fresh. An amount from an
 * earlier part of the conversation must not follow them into every later
 * recommendation — "$100" said once is a hint for the next step, not a
 * budget for the visit.
 */
function freshAmount(state: ConversationState): number | null {
  if (!state.amountUSD) return null;
  const turns = state.turns ?? 0;
  const stated = state.amountTurn ?? turns;
  return turns - stated <= AMOUNT_MEMORY_TURNS ? state.amountUSD : null;
}

interface Ctx {
  req: ConciergeRequest;
  locale: string;
  s: Strings;
  catalog: ConciergeCatalog;
  state: ConversationState;
  current: CatalogCampaign | null;
  /** The signed-in donor, from the server session only. */
  donor: DonorContext | null;
}

function recommendationBlock(ctx: Ctx, intent: ConciergeIntent, reasons?: Record<string, string>, ids?: string[]): { block: ConciergeBlock; shown: string[] } {
  const exclude = ctx.state.shownCampaignIds ?? [];
  let picked: CatalogCampaign[];
  if (ids?.length) {
    picked = ids.map((id) => ctx.catalog.campaigns.find((c) => c.id === id)).filter((c): c is CatalogCampaign => Boolean(c)).slice(0, 3);
  } else {
    picked = rankCampaigns(
      ctx.catalog.campaigns,
      { intent, region: ctx.state.region ?? null, amountUSD: freshAmount(ctx.state), text: null, excludeIds: exclude, currentCampaignId: ctx.current?.id ?? null },
      3
    ).map((r) => r.campaign);
  }
  const cards = picked.map((c) => toCard(c, reasons?.[c.id] ?? templateWhy(ctx.s, ctx.locale, c, intent)));
  return { block: { type: "campaign_recommendations", campaigns: cards }, shown: picked.map((c) => c.id) };
}

function configurationBlock(ctx: Ctx, campaign: CatalogCampaign | null, category: CatalogCategory | null, typeKey: "project" | "zakat", genericTitleKey: string | null): ConciergeBlock {
  const preset = freshAmount(ctx.state);
  return {
    type: "donation_configuration",
    campaign: campaign ? toCard(campaign, null) : null,
    category: category ? toCategoryCard(category) : null,
    genericTitleKey,
    typeKey,
    suggestedAmountsUSD: amountsFor(campaign, preset),
    presetAmountUSD: preset,
    frequencies: typeKey === "zakat" ? ["once"] : [...FREQUENCIES],
    presetFrequency: typeKey === "zakat" ? "once" : ctx.state.frequency ?? null,
    allowGift: typeKey === "project",
    giftRecipientName: ctx.state.giftRecipientName ?? null,
  };
}

function viewAction(s: Strings, c: CatalogCampaign): ConciergeAction {
  return { type: "navigate", label: s.a_view ?? "", route: "projectDetail", extra: [c.slug], track: "campaign_viewed" };
}

function respond(ctx: Ctx, partial: Omit<ConciergeResponse, "state"> & { state?: Partial<ConversationState> }): ConciergeResponse {
  const turns = (ctx.state.turns ?? 0) + 1;
  return { ...partial, state: { ...ctx.state, ...(partial.state ?? {}), turns } };
}

/* ── Deterministic flows ─────────────────────────────────────────────────── */

function welcome(ctx: Ctx): ConciergeResponse {
  const actions = chips(ctx.s);
  if (ctx.current) actions.unshift({ type: "intent", label: ctx.s.a_this_project ?? "", intent: "current_page" });
  const blocks: ConciergeBlock[] = [];
  let message = ctx.s.s_welcome ?? "";
  if (ctx.donor) {
    message = ctx.donor.firstName ? fill(ctx.s.s_welcome_signed, { name: ctx.donor.firstName }) : ctx.s.s_welcome ?? "";
    actions.push({ type: "intent", label: ctx.s.c_account ?? "", intent: "account" });
    /* Something of theirs needs attention: say so first, quietly. */
    const pending = ctx.donor.recent.find((d) => d.state === "awaiting_receipt" || d.state === "under_review" || d.state === "rejected");
    if (pending) {
      blocks.push({ type: "notice", tone: "warning", text: ctx.s.n_pending_transfer ?? "" });
      actions.unshift({ type: "navigate", label: ctx.s.a_payment_pending ?? "", route: "paymentPending", extra: [pending.id] });
    }
    if (ctx.donor.plans.some((p) => p.status === "PAYMENT_FAILED")) {
      blocks.push({ type: "notice", tone: "warning", text: ctx.s.n_plan_failed ?? "" });
      actions.unshift({ type: "navigate", label: ctx.s.a_account ?? "", route: "account" });
    }
  }
  return respond(ctx, { message, blocks, actions, mode: "deterministic", intent: "unknown" });
}

const DOC_WORDS = /إيصال|ايصال|شهاد|receipt|certificate|makbuz|sertifika|belge|reçu|certificat|quittung|urkunde|recibo|certificado|kuitansi|sertifikat|resit|sijil|رسید|سرٹیفکیٹ|領収|感謝状|收据|证书|रसीद|प्रमाणपत्र/i;

/**
 * Deterministic links to a signed-in donor's own documents, added under any
 * account reply so the receipt or certificate is one tap away whatever the
 * model wrote: the latest paid donation's documents when the message asks
 * for them, and the unfinished bank transfer whenever there is one.
 */
function donorActions(ctx: Ctx, text: string, existing: ConciergeAction[]): ConciergeAction[] {
  if (!ctx.donor) return [];
  const out: ConciergeAction[] = [];
  const has = (route: string) => existing.some((a) => a.type === "navigate" && a.route === route);
  const paid = ctx.donor.recent.find((d) => d.documentsReady);
  if (paid && DOC_WORDS.test(text)) {
    if (!has("receipt")) out.push({ type: "navigate", label: ctx.s.a_receipt ?? "", route: "receipt", extra: [paid.id] });
    if (!has("thanksCertificate")) out.push({ type: "navigate", label: ctx.s.a_certificate ?? "", route: "thanksCertificate", extra: [paid.id] });
  }
  const pending = ctx.donor.recent.find((d) => d.state === "awaiting_receipt" || d.state === "under_review" || d.state === "rejected");
  if (pending && !has("paymentPending")) out.push({ type: "navigate", label: ctx.s.a_payment_pending ?? "", route: "paymentPending", extra: [pending.id] });
  return out;
}

/**
 * "Where would you like it to go?" — the areas of the site as cards, for a
 * visitor who wants to give but has not said what for. Choosing one lists
 * its projects (`selectCategoryFlow`).
 */
function categoryFlow(ctx: Ctx, message?: string): ConciergeResponse {
  const usable = ctx.catalog.categories.filter((c) => c.projectCount > 0 || c.canDonateDirectly);
  const types = usable.filter((c) => c.kind === "type").sort((a, b) => b.projectCount - a.projectCount);
  const regions = usable.filter((c) => c.kind === "region").sort((a, b) => b.projectCount - a.projectCount);
  const cards = [...types.slice(0, 4), ...regions.slice(0, 8)].slice(0, 12).map(toCategoryCard);
  /* A stated plan is acknowledged in the question, so the visitor knows it
     will be the default when they reach a project. */
  const amount = freshAmount(ctx.state);
  const planned =
    amount && ctx.state.frequency && ctx.state.frequency !== "once"
      ? fill(ctx.s.s_ask_where_plan, { amount: fmtUsd(ctx.locale, amount), frequency: ctx.s[`f_${ctx.state.frequency}`] ?? ctx.state.frequency })
      : amount
        ? fill(ctx.s.s_ask_where_amount, { amount: fmtUsd(ctx.locale, amount) })
        : null;
  return respond(ctx, {
    message: message ?? planned ?? ctx.s.s_ask_where ?? "",
    blocks: [{ type: "category_options", categories: cards }],
    actions: [{ type: "navigate", label: ctx.s.a_projects ?? "", route: "projects" }],
    mode: message ? "llm" : "deterministic",
    intent: ctx.state.intent === "recurring" ? "recurring" : "explore",
    state: { intent: ctx.state.intent === "recurring" ? "recurring" : "explore" },
  });
}

type SuggestionKind = "campaign" | "recurring" | "zakat" | "waqf" | "category" | "none";

/**
 * The one next step under a plain answer, with its OK action. The text is
 * the model's when it gave one, else the template; the target is always a
 * real thing on the site — a catalog campaign or one of the guided flows.
 */
function suggestionBlock(ctx: Ctx, kind: SuggestionKind, campaignId: string | null, text: string | null, candidates: readonly CatalogCampaign[]): ConciergeBlock | null {
  if (kind === "none") return null;
  if (kind === "campaign") {
    const campaign = (campaignId && candidates.find((c) => c.id === campaignId)) || candidates[0] || null;
    if (!campaign) return null;
    /* The wording must name the project the OK button opens; a model line
       about a different project than the id it chose falls back to the template. */
    const wording = text && text.includes(campaign.title) ? text : fill(ctx.s.s_suggest_campaign, { title: campaign.title });
    return { type: "suggestion", text: wording, campaign: toCard(campaign, null), accept: { type: "select_campaign", label: ctx.s.a_ok ?? "OK", campaignId: campaign.id } };
  }
  const intent: ConciergeIntent = kind === "recurring" ? "recurring" : kind === "zakat" ? "zakat" : kind === "waqf" ? "waqf" : "explore";
  const template = kind === "recurring" ? ctx.s.s_suggest_recurring : kind === "zakat" ? ctx.s.s_suggest_zakat : kind === "waqf" ? ctx.s.s_suggest_waqf : ctx.s.s_suggest_category;
  return { type: "suggestion", text: text || template || "", campaign: null, accept: { type: "intent", label: ctx.s.a_ok ?? "OK", intent } };
}

/** The suggestion that fits an intent when the model gave none. */
function fallbackSuggestion(ctx: Ctx, intent: ConciergeIntent | null, candidates: readonly CatalogCampaign[]): ConciergeBlock | null {
  if (intent === "zakat") return suggestionBlock(ctx, "zakat", null, null, candidates);
  if (intent === "waqf") return suggestionBlock(ctx, "waqf", null, null, candidates);
  if (intent === "recurring") return suggestionBlock(ctx, "recurring", null, null, candidates);
  if (intent === "account") return suggestionBlock(ctx, ctx.donor && ctx.donor.plans.length === 0 ? "recurring" : "campaign", null, null, candidates);
  if (candidates.length && (intent === "sadaqah_jariyah" || intent === "relief" || intent === "gift" || intent === "most_needed" || ctx.state.region)) return suggestionBlock(ctx, "campaign", null, null, candidates);
  return suggestionBlock(ctx, "category", null, null, candidates);
}

type SupportSubject = "COMPLAINT" | "DONATION_ISSUE" | "CAMPAIGN_SUPPORT" | "PARTNERSHIP" | "VOLUNTEERING" | "GENERAL";

const DONATION_WORDS = /تبرع|تبرعي|تبرعات|دفع|خصم|فلوس|مبلغ|إيصال|ايصال|بطاق|تحويل|donat|payment|paid|charg|receipt|card|transfer|money|refund|bağış|ödeme|makbuz|kart|havale|iade|don\b|paiement|reçu|rembours|spende|zahlung|quittung|donación|pago|recibo|reembolso|donasi|pembayaran|kuitansi|عطیہ|ادائیگی|رسید/i;

/**
 * The ticket form. The donation list is offered only when the problem is
 * about a donation; a partnership or a general complaint gets the plain
 * form. The draft is what the assistant understood, in the visitor's
 * words, ready to send or edit.
 */
function supportBlock(ctx: Ctx, subject: SupportSubject, presetDonationId: string | null, aboutDonation: boolean, draft: string): ConciergeBlock {
  return {
    type: "support_ticket",
    subject,
    signedIn: Boolean(ctx.donor),
    donations: aboutDonation ? (ctx.donor?.recent ?? []).map((d) => ({ id: d.id, date: d.date, amount: d.amount, currency: d.currency, state: d.state, items: d.items })) : [],
    presetDonationId: aboutDonation && presetDonationId && ctx.donor?.donationIds.includes(presetDonationId) ? presetDonationId : null,
    aboutDonation,
    draft: draft.trim().slice(0, 1200),
  };
}

/**
 * A problem the team must handle. The reply is about *their* giving when
 * they are signed in — which donation, what state it is in — and the form
 * under it files the message to the inbox; the contact page stays as the
 * other door.
 */
function supportFlow(
  ctx: Ctx,
  message?: string,
  subject: SupportSubject = "COMPLAINT",
  presetDonationId: string | null = null,
  ticket: { aboutDonation: boolean; draft: string } = { aboutDonation: true, draft: "" }
): ConciergeResponse {
  const d = ctx.donor;
  let text = message;
  if (!text) {
    if (!ticket.aboutDonation) {
      text = ctx.s.s_support_intro_general ?? "";
    } else if (d && d.recent.length) {
      const latest = d.recent[0];
      const state = ctx.s[`st_${latest.state}`] ?? latest.state;
      text = fill(ctx.s.s_support_intro, { name: d.firstName, amount: `${latest.amount} ${latest.currency}`, date: latest.date, state });
    } else {
      text = ctx.s.s_support_intro_guest ?? "";
    }
  }
  return respond(ctx, {
    message: text,
    blocks: [supportBlock(ctx, subject, presetDonationId, ticket.aboutDonation, ticket.draft)],
    actions: [{ type: "navigate", label: ctx.s.a_contact ?? "", route: "contact" }],
    mode: message ? "llm" : "deterministic",
    intent: "support",
    state: { intent: "support" },
  });
}

type CommandInput = {
  kind: "set_language" | "set_currency" | "update_profile" | "update_plan";
  locale?: string | null;
  currency?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  planId?: string | null;
  planAmount?: number | null;
  planFrequency?: "DAILY" | "FRIDAY" | "MONTHLY" | null;
  planStatus?: "ACTIVE" | "PAUSED" | "CANCELLED" | null;
};

/**
 * Turn a change the visitor asked for into a confirmation card, or into a
 * plain answer when it cannot be done (not signed in, no such plan, a
 * cadence the plan's gateway does not allow). The browser performs the
 * change only after the OK.
 */
function commandFlow(ctx: Ctx, cmd: CommandInput, lead?: string): ConciergeResponse | null {
  const s = ctx.s;
  const say = (message: string, actions: ConciergeAction[] = []): ConciergeResponse =>
    respond(ctx, { message, blocks: [], actions, mode: lead ? "llm" : "deterministic", intent: "question" });
  const card = (command: Extract<ConciergeBlock, { type: "command" }>["command"], text: string): ConciergeResponse =>
    respond(ctx, { message: lead ?? text, blocks: [{ type: "command", command, text }], actions: [], mode: lead ? "llm" : "deterministic", intent: "question" });

  if (cmd.kind === "set_language") {
    const locale = cmd.locale && isValidLocale(cmd.locale) ? cmd.locale : null;
    if (!locale) return null;
    const label = LOCALES[locale].nativeLabel;
    return card({ kind: "set_language", locale, label }, fill(s.cmd_confirm_language, { language: label }));
  }
  if (cmd.kind === "set_currency") {
    const currency = cmd.currency && SUPPORTED_CURRENCY_CODES.includes(cmd.currency.toUpperCase()) ? cmd.currency.toUpperCase() : null;
    if (!currency) return null;
    return card({ kind: "set_currency", currency }, fill(s.cmd_confirm_currency, { currency }));
  }
  if (!ctx.donor) return say(s.cmd_signin ?? "", [{ type: "navigate", label: s.a_account ?? "", route: "account" }]);

  if (cmd.kind === "update_profile") {
    const fields: { name?: string; phone?: string; email?: string } = {};
    if (cmd.name?.trim()) fields.name = cmd.name.trim().slice(0, 120);
    if (cmd.phone?.trim()) fields.phone = cmd.phone.replace(/[^\d+]/g, "").slice(0, 20);
    if (cmd.email?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cmd.email.trim())) fields.email = cmd.email.trim().toLowerCase();
    if (!Object.keys(fields).length) return null;
    const summary = [fields.name && `${s.cmd_field_name}: ${fields.name}`, fields.phone && `${s.cmd_field_phone}: ${fields.phone}`, fields.email && `${s.cmd_field_email}: ${fields.email}`].filter(Boolean).join(" · ");
    return card({ kind: "update_profile", userId: ctx.donor.userId, fields }, fill(s.cmd_confirm_profile, { summary }));
  }

  /* update_plan */
  const live = ctx.donor.plans.filter((p) => p.status !== "CANCELLED");
  const plan = (cmd.planId && live.find((p) => p.id === cmd.planId)) || (live.length === 1 ? live[0] : null);
  if (!plan) {
    if (!live.length) return say(s.cmd_no_plan ?? "", [{ type: "intent", label: s.c_recurring ?? "", intent: "recurring" }]);
    return { ...accountFlow(ctx, s.cmd_which_plan), intent: "account" };
  }
  const changes: { amount?: number; frequency?: "DAILY" | "FRIDAY" | "MONTHLY"; status?: "ACTIVE" | "PAUSED" | "CANCELLED" } = {};
  if (cmd.planAmount && cmd.planAmount > 0 && Math.abs(cmd.planAmount - plan.amount) > 0.004) changes.amount = Math.round(cmd.planAmount * 100) / 100;
  if (cmd.planFrequency && cmd.planFrequency !== plan.frequency) changes.frequency = cmd.planFrequency;
  if (cmd.planStatus && cmd.planStatus !== plan.status) changes.status = cmd.planStatus;
  if (!Object.keys(changes).length) return null;
  const planLabel = `${plan.amount} ${plan.currency} · ${s[`f_${plan.frequency.toLowerCase()}`] ?? plan.frequency}${plan.items[0] ? ` · ${plan.items[0]}` : ""}`;
  const parts = [
    changes.amount !== undefined && `${s.cmd_field_amount}: ${changes.amount} ${plan.currency}`,
    changes.frequency && `${s.cmd_field_frequency}: ${s[`f_${changes.frequency.toLowerCase()}`] ?? changes.frequency}`,
    changes.status && `${s.cmd_field_status}: ${s[`ps_${changes.status}`] ?? changes.status}`,
  ].filter(Boolean).join(" · ");
  return card({ kind: "update_plan", planId: plan.id, planLabel, changes }, fill(s.cmd_confirm_plan, { plan: planLabel, changes: parts }));
}

/** The donor's own giving, or the way to it when they are not signed in. */
function accountFlow(ctx: Ctx, message?: string): ConciergeResponse {
  if (!ctx.donor) {
    return respond(ctx, {
      message: message ?? ctx.s.s_account_signin ?? "",
      blocks: [],
      actions: [{ type: "navigate", label: ctx.s.a_account ?? "", route: "account" }, { type: "navigate", label: ctx.s.a_contact ?? "", route: "contact" }],
      mode: "deterministic",
      intent: "account",
      state: { intent: "account" },
    });
  }
  const d = ctx.donor;
  const empty = d.totals.donations === 0 && d.recent.length === 0 && d.plans.length === 0;
  const blocks: ConciergeBlock[] = empty
    ? []
    : [
        {
          type: "donor_summary",
          firstName: d.firstName,
          totals: d.totals,
          donations: d.recent.map((r) => ({ id: r.id, date: r.date, amount: r.amount, currency: r.currency, state: r.state, items: r.items, recurring: r.recurring, documentsReady: r.documentsReady })),
          plans: d.plans.map((p) => ({ id: p.id, frequency: p.frequency, amount: p.amount, currency: p.currency, status: p.status, nextBillingDate: p.nextBillingDate, items: p.items })),
        },
      ];
  const actions: ConciergeAction[] = [{ type: "navigate", label: ctx.s.a_account ?? "", route: "account" }];
  if (empty) actions.push(...chips(ctx.s).slice(0, 3));
  const next = fallbackSuggestion(ctx, "account", rankCampaigns(ctx.catalog.campaigns, { intent: null, region: null, amountUSD: null, text: null }, 1).map((r) => r.campaign));
  if (next) blocks.push(next);
  return respond(ctx, { message: message ?? (empty ? ctx.s.s_account_empty : ctx.s.s_account) ?? "", blocks, actions, mode: "deterministic", intent: "account", state: { intent: "account" } });
}

function zakatFlow(ctx: Ctx, message?: string): ConciergeResponse {
  const zakatCategory = ctx.catalog.zakatCategoryId ? ctx.catalog.categories.find((c) => c.id === ctx.catalog.zakatCategoryId) ?? null : null;
  const blocks: ConciergeBlock[] = [{ type: "zakat_card", zakatCategoryId: zakatCategory?.id ?? null, rate: 0.025 }];
  const actions: ConciergeAction[] = [
    { type: "navigate", label: ctx.s.a_calc ?? "", route: "zakatCalculator", track: "zakat_started" },
    { type: "configure", label: ctx.s.a_zakat_amount ?? "", campaignId: null, categoryId: zakatCategory?.id ?? null },
    { type: "navigate", label: ctx.s.a_zakat_page ?? "", route: "zakat" },
  ];
  return respond(ctx, { message: message ?? ctx.s.s_intent_zakat ?? "", blocks, actions, mode: "deterministic", intent: "zakat", state: { intent: "zakat" } });
}

function waqfFlow(ctx: Ctx, message?: string): ConciergeResponse {
  return respond(ctx, {
    message: message ?? ctx.s.s_intent_waqf ?? "",
    blocks: [{ type: "waqf_options", units: ctx.catalog.waqf }],
    actions: [{ type: "navigate", label: ctx.s.a_waqf_page ?? "", route: "waqf", track: "waqf_started" }],
    mode: "deterministic",
    intent: "waqf",
    state: { intent: "waqf" },
  });
}

function currentPageFlow(ctx: Ctx): ConciergeResponse {
  if (!ctx.current) return recommendFlow(ctx, "explore");
  return respond(ctx, {
    message: ctx.s.s_current ?? "",
    blocks: [configurationBlock(ctx, ctx.current, null, "project", null)],
    actions: [viewAction(ctx.s, ctx.current)],
    mode: "deterministic",
    intent: "current_page",
    state: { intent: "current_page", selectedCampaignId: ctx.current.id },
  });
}

const INTENT_MESSAGE_KEY: Partial<Record<ConciergeIntent, string>> = {
  sadaqah_jariyah: "s_intent_sadaqah",
  relief: "s_intent_relief",
  recurring: "s_intent_recurring",
  explore: "s_intent_explore",
  most_needed: "s_intent_most_needed",
  gift: "s_intent_gift",
  unknown: "s_intent_explore",
  question: "s_intent_explore",
};

function recommendFlow(ctx: Ctx, intent: ConciergeIntent, message?: string, reasons?: Record<string, string>, ids?: string[], mentionBudget = false): ConciergeResponse {
  const effective = intent === "unknown" || intent === "question" ? "explore" : intent;
  const { block, shown } = recommendationBlock(ctx, effective, reasons, ids);
  const blocks: ConciergeBlock[] = [];
  if (block.type === "campaign_recommendations" && block.campaigns.length === 0) {
    const cats = rankCategories(ctx.catalog.categories, effective, 4).map(toCategoryCard);
    blocks.push({ type: "category_options", categories: cats });
  } else {
    blocks.push(block);
  }
  /* The budget is echoed only in the turn it was said, never on later ones. */
  const budget = mentionBudget && ctx.state.amountUSD ? `${fill(ctx.s.s_budget, { amount: fmtUsd(ctx.locale, ctx.state.amountUSD) })} ` : "";
  /* Projects the model picked for the visitor's words are introduced as such, not as "our featured projects". */
  const picked = ids?.length ? (ids.length === 1 ? ctx.s.s_topic_campaign : ctx.s.s_topic_campaigns) : null;
  const text = message ?? `${budget}${picked ?? ctx.s[INTENT_MESSAGE_KEY[effective] ?? "s_intent_explore"] ?? ""}`;
  const actions: ConciergeAction[] = [
    { type: "show_more", label: ctx.s.a_more ?? "" },
    { type: "navigate", label: ctx.s.a_projects ?? "", route: "projects" },
  ];
  if (effective === "recurring") actions.unshift({ type: "navigate", label: ctx.s.a_recurring_page ?? "", route: "recurring" });
  return respond(ctx, {
    message: text,
    blocks,
    actions,
    mode: message ? "llm" : "deterministic",
    intent: effective,
    state: { intent: effective, shownCampaignIds: [...(ctx.state.shownCampaignIds ?? []), ...shown].slice(-30) },
  });
}

/**
 * A wish that points at real things on the site, answered at its own
 * width: the projects that match it when it names projects; everything in
 * an area when it names one area; a choice among the areas when it fits
 * several. Nothing is forced into a single lane.
 */
function topicFlow(ctx: Ctx, lead: string | undefined, campaignIds: readonly string[], categoryIds: readonly string[], reasons?: Record<string, string>): ConciergeResponse | null {
  const intent: ConciergeIntent = ctx.state.intent && ctx.state.intent !== "question" && ctx.state.intent !== "unknown" ? ctx.state.intent : "explore";
  const shownState = (ids: string[]) => ({ intent, shownCampaignIds: [...(ctx.state.shownCampaignIds ?? []), ...ids].slice(-30) });
  const cardsFor = (list: CatalogCampaign[]) => list.map((c) => toCard(c, reasons?.[c.id] ?? templateWhy(ctx.s, ctx.locale, c, intent)));
  const browse: ConciergeAction = { type: "navigate", label: ctx.s.a_projects ?? "", route: "projects" };

  const picked = campaignIds.map((id) => ctx.catalog.campaigns.find((c) => c.id === id)).filter((c): c is CatalogCampaign => Boolean(c)).slice(0, 6);
  if (picked.length) {
    return respond(ctx, {
      message: lead ?? (picked.length === 1 ? ctx.s.s_topic_campaign ?? "" : ctx.s.s_topic_campaigns ?? ""),
      blocks: [{ type: "campaign_recommendations", campaigns: cardsFor(picked) }],
      actions: [{ type: "show_more", label: ctx.s.a_more ?? "" }, browse],
      mode: lead ? "llm" : "deterministic",
      intent,
      state: shownState(picked.map((c) => c.id)),
    });
  }

  const cats = categoryIds.map((id) => ctx.catalog.categories.find((c) => c.id === id)).filter((c): c is CatalogCategory => Boolean(c)).slice(0, 4);
  if (cats.length === 1) {
    const category = cats[0];
    if (category.slug === "type-zakat" || category.slug === "type-waqf" || category.canDonateDirectly) {
      const res = selectCategoryFlow(ctx, category.id);
      return lead ? { ...res, message: lead, mode: "llm" } : res;
    }
    const inCategory = ctx.catalog.campaigns.filter((c) => c.categoryIds.includes(category.id));
    const all = rankCampaigns(inCategory, { intent: ctx.state.intent ?? null, region: null, amountUSD: freshAmount(ctx.state), text: null }, 8).map((r) => r.campaign);
    if (!all.length) return null;
    return respond(ctx, {
      message: lead ?? fill(ctx.s.s_topic_category, { category: category.title }),
      blocks: [{ type: "campaign_recommendations", campaigns: cardsFor(all) }],
      actions: [browse],
      mode: lead ? "llm" : "deterministic",
      intent,
      state: shownState(all.map((c) => c.id)),
    });
  }
  if (cats.length > 1) {
    return respond(ctx, {
      message: lead ?? ctx.s.s_topic_choose ?? "",
      blocks: [{ type: "category_options", categories: cats.map(toCategoryCard) }],
      actions: [browse],
      mode: lead ? "llm" : "deterministic",
      intent,
      state: { intent },
    });
  }
  return null;
}

function selectCampaignFlow(ctx: Ctx, campaignId: string): ConciergeResponse {
  const campaign = ctx.catalog.campaigns.find((c) => c.id === campaignId);
  if (!campaign) {
    const fallback = recommendFlow(ctx, ctx.state.intent ?? "explore");
    return { ...fallback, message: ctx.s.s_unavailable ?? fallback.message };
  }
  const known = Boolean(ctx.state.frequency);
  return respond(ctx, {
    message: known ? fill(ctx.s.s_selected, { title: campaign.title }) : ctx.s.s_choose_freq ?? "",
    blocks: [configurationBlock(ctx, campaign, null, "project", null)],
    actions: [viewAction(ctx.s, campaign)],
    mode: "deterministic",
    intent: ctx.state.intent ?? "explore",
    state: { selectedCampaignId: campaign.id },
  });
}

function selectCategoryFlow(ctx: Ctx, categoryId: string): ConciergeResponse {
  const category = ctx.catalog.categories.find((c) => c.id === categoryId);
  if (!category) return recommendFlow(ctx, ctx.state.intent ?? "explore");
  if (category.slug === "type-zakat") return zakatFlow(ctx);
  if (category.slug === "type-waqf") return waqfFlow(ctx);
  if (category.canDonateDirectly) {
    return respond(ctx, {
      message: ctx.s.s_choose_freq ?? "",
      blocks: [configurationBlock(ctx, null, category, "project", null)],
      actions: [{ type: "navigate", label: ctx.s.a_view_category ?? "", route: "projects" }],
      mode: "deterministic",
      intent: ctx.state.intent ?? "explore",
    });
  }
  /* A category that does not take donations itself: its projects instead. */
  const inCategory = ctx.catalog.campaigns.filter((c) => c.categoryIds.includes(category.id));
  const picked = rankCampaigns(inCategory, { intent: ctx.state.intent ?? null, region: null, amountUSD: freshAmount(ctx.state), text: null }, 3).map((r) => r.campaign);
  return respond(ctx, {
    message: fill(ctx.s.s_in_category, { category: category.title }),
    blocks: [{ type: "campaign_recommendations", campaigns: picked.map((c) => toCard(c, templateWhy(ctx.s, ctx.locale, c, ctx.state.intent ?? null))) }],
    actions: [{ type: "show_more", label: ctx.s.a_more ?? "" }],
    mode: "deterministic",
    intent: ctx.state.intent ?? "explore",
    state: { shownCampaignIds: [...(ctx.state.shownCampaignIds ?? []), ...picked.map((c) => c.id)].slice(-30) },
  });
}

function addedFlow(ctx: Ctx, step: Extract<ConciergeRequest["step"], { kind: "added" }>): ConciergeResponse {
  const campaign = step.campaignId ? ctx.catalog.campaigns.find((c) => c.id === step.campaignId) ?? null : null;
  const category = step.categoryId ? ctx.catalog.categories.find((c) => c.id === step.categoryId) ?? null : null;
  const title = campaign?.title ?? category?.title ?? (step.waqf ? ctx.s.waqf_title ?? "" : ctx.s.zakat_title ?? "");
  const freqWord = ctx.s[`f_${step.frequency}`] ?? step.frequency;
  const blocks: ConciergeBlock[] = [{ type: "cart_confirmation", title, amountUSD: step.amountUSD, frequency: step.frequency }];
  const cross = pickCrossSell(ctx.catalog.campaigns, ctx.catalog.upsellIds, campaign?.id ?? null, ctx.state.cartCampaignIds ?? []);
  if (cross) blocks.push({ type: "cross_sell", campaign: toCard(cross, templateWhy(ctx.s, ctx.locale, cross, null)), suggestedAmountsUSD: amountsFor(cross, null).slice(0, 3) });
  return respond(ctx, {
    message: `${fill(ctx.s.s_configured, { frequency: freqWord, amount: fmtUsd(ctx.locale, step.amountUSD), title })} ${ctx.s.s_added ?? ""}`,
    blocks,
    actions: [
      { type: "checkout", label: ctx.s.a_checkout ?? "" },
      { type: "open_cart", label: ctx.s.a_cart ?? "" },
    ],
    mode: "deterministic",
    intent: ctx.state.intent ?? "explore",
    state: { cartCampaignIds: [...(ctx.state.cartCampaignIds ?? []), ...(campaign ? [campaign.id] : [])].slice(-50) },
  });
}

/* ── Free text ───────────────────────────────────────────────────────────── */

async function toUsd(amount: number, currency: string | null, fallbackCurrency: string | undefined): Promise<number> {
  const code = normalizeDonationCurrencyCode(currency ?? fallbackCurrency ?? "USD");
  if (code === "USD") return Math.round(amount * 100) / 100;
  try {
    const usd = await convertAmountInCurrencyToUsd(amount, code);
    return usd > 0 ? Math.round(usd * 100) / 100 : amount;
  } catch {
    return amount;
  }
}

async function messageFlow(ctx: Ctx, text: string): Promise<ConciergeResponse> {
  const parsed = parseMessage(text);
  const next: Partial<ConversationState> = {};
  if (parsed.amount) {
    next.amountUSD = await toUsd(parsed.amount, parsed.currency, ctx.req.currency);
    next.amountTurn = (ctx.state.turns ?? 0) + 1;
  }
  if (parsed.frequency) next.frequency = parsed.frequency;
  if (parsed.region) next.region = parsed.region;
  if (parsed.giftRecipientName) next.giftRecipientName = parsed.giftRecipientName;
  ctx = { ...ctx, state: { ...ctx.state, ...next } };

  if (parsed.needsRuling) {
    const base = parsed.intent === "zakat" || ctx.state.intent === "zakat" ? zakatFlow(ctx, ctx.s.s_ruling) : respond(ctx, { message: ctx.s.s_ruling ?? "", blocks: [], actions: [], mode: "deterministic", intent: "question" });
    return { ...base, actions: [{ type: "navigate", label: ctx.s.a_contact ?? "", route: "contact" }, ...base.actions], intent: "question" };
  }

  let intent: ConciergeIntent | null = parsed.intent;
  /* "this project" only means something on a project page — and there, a
     question about "this" is answered with this project's configurator, with
     the cause the visitor named remembered for the wording and the ranking. */
  if (intent === "current_page" && !ctx.current) intent = null;
  if (ctx.current && mentionsCurrentPage(text) && intent !== "zakat" && intent !== "waqf" && !parsed.needsRuling) {
    const remembered = intent && intent !== "current_page" ? intent : ctx.state.intent ?? null;
    const res = currentPageFlow({ ...ctx, state: { ...ctx.state, intent: remembered ?? undefined } });
    return { ...res, state: { ...res.state, intent: remembered ?? res.state.intent } };
  }
  /* A bare amount or frequency after a campaign was chosen just refines it. */
  if (!intent && ctx.state.selectedCampaignId && (parsed.amount || parsed.frequency)) {
    return selectCampaignFlow(ctx, ctx.state.selectedCampaignId);
  }

  /* "I want to donate" with nothing to go on: ask where, with the areas as
     cards. A place, cause, dedication or "this project" already answers it. */
  /* Language and currency switches need no model. */
  const quickCommand = parseCommand(text);
  if (quickCommand) {
    const res = commandFlow(ctx, quickCommand);
    if (res) return res;
  }

  /* A plan with no destination ("500 over 5 months", "every Friday") is the
     same question: where? The amount and cadence ride along into the cards. */
  /* What the words themselves point at — matching projects, one area in
     full, or a choice among areas — read from the catalog alone. A wish
     with a topic is never "bare", whatever else it says. */
  const topic = resolveTopic(ctx.catalog.campaigns, ctx.catalog.categories, text);
  const strongCampaigns = topic?.kind === "campaigns" ? topic.ids : [];
  const hasTopic = topic !== null;
  const topical = (lead?: string, reasons?: Record<string, string>): ConciergeResponse | null => {
    if (!topic) return null;
    const tctx = { ...ctx, state: { ...ctx.state, intent: intent ?? ctx.state.intent ?? "explore" } };
    if (topic.kind === "campaigns") return topicFlow(tctx, lead, topic.ids, [], reasons);
    return topicFlow(tctx, lead, [], topic.kind === "category" ? [topic.id] : topic.ids);
  };
  if ((!intent || intent === "explore" || intent === "recurring") && !ctx.state.region && !ctx.state.selectedCampaignId && wantsToDonate(text) && !parsed.region && !hasTopic && bareWish(text)) {
    return categoryFlow(intent === "recurring" ? { ...ctx, state: { ...ctx.state, intent: "recurring" } } : ctx);
  }

  const poolIntent = intent ?? ctx.state.intent ?? null;
  const candidates = rankCampaigns(
    ctx.catalog.campaigns,
    { intent: poolIntent, region: ctx.state.region ?? null, amountUSD: freshAmount(ctx.state), text, currentCampaignId: ctx.current?.id ?? null },
    8
  ).map((r) => r.campaign);

  const knowledge = await loadKnowledge(ctx.locale);
  const outcome = await askModel({
    locale: ctx.locale,
    message: text,
    history: ctx.req.history ?? [],
    candidates,
    categories: ctx.catalog.categories.filter((c) => c.projectCount > 0 || c.canDonateDirectly),
    parsed: {
      intent: poolIntent,
      amount: freshAmount(ctx.state),
      currency: "USD",
      frequency: ctx.state.frequency ?? null,
      region: ctx.state.region ?? null,
      recurringNudged: ctx.state.recurringNudged === true,
      route: ctx.req.page?.route ?? null,
    },
    currentCampaign: ctx.current,
    waqf: ctx.catalog.waqf,
    knowledge,
    donor: ctx.donor,
  });
  const verdict = outcome.verdict;
  if (!verdict && outcome.reason !== "disabled") console.warn("[concierge] model fallback", outcome.reason);

  if (verdict) {
    intent = intent ?? verdict.intent;
    if (!parsed.amount && verdict.amount) {
      ctx.state.amountUSD = await toUsd(verdict.amount, verdict.currency, ctx.req.currency);
      ctx.state.amountTurn = (ctx.state.turns ?? 0) + 1;
    }
    const budgetStated = Boolean(parsed.amount || verdict.amount);
    if (!ctx.state.frequency && verdict.frequency) ctx.state.frequency = verdict.frequency;
    if (!ctx.state.giftRecipientName && verdict.giftRecipientName) ctx.state.giftRecipientName = verdict.giftRecipientName;
    /* The one regular-giving mention is spent on the first model reply that
       could have carried it; the prompt never repeats it after this. */
    if (!ctx.state.recurringNudged && verdict.mode !== "answer" && intent !== "recurring" && intent !== "zakat") ctx.state.recurringNudged = true;

    const contact: ConciergeAction = { type: "navigate", label: ctx.s.a_contact ?? "", route: "contact" };
    /* A document route needs one of the donor's own donation ids — anything
       else the model puts there is ignored and the account page offered. */
    const documentRoutes = new Set(["receipt", "thanksCertificate", "paymentPending"]);
    const ownDonation = verdict.donationId && ctx.donor?.donationIds.includes(verdict.donationId) ? verdict.donationId : null;
    let routeAction: ConciergeAction | null = null;
    if (verdict.route && verdict.route !== "contact" && knowledge.routeLabels[verdict.route]) {
      if (documentRoutes.has(verdict.route)) {
        routeAction = ownDonation
          ? { type: "navigate", label: knowledge.routeLabels[verdict.route], route: verdict.route, extra: [ownDonation] }
          : ctx.donor
            ? { type: "navigate", label: knowledge.routeLabels.account ?? "", route: "account" }
            : null;
      } else {
        routeAction = { type: "navigate", label: knowledge.routeLabels[verdict.route], route: verdict.route, track: verdict.route === "zakatCalculator" ? "zakat_started" : verdict.route === "waqf" ? "waqf_started" : undefined };
      }
    }
    const answer = verdict.answer.trim();

    /* Something to change for them: a confirmation card under the reply. */
    if (verdict.command.kind !== "none") {
      const res = commandFlow(ctx, { ...verdict.command, kind: verdict.command.kind }, answer || undefined);
      if (res) return res;
    }

    /* A problem for the team: the model's customised reply, then the ticket
       form with the donation it named already selected. Checked before the
       account sign-in answer, so a visitor's refund request gets the form
       too. No cross-sell here. */
    /* The model alone cannot open a ticket: it must name a subject, or the
       visitor's own words must be a problem. Sympathy is not a complaint. */
    if (verdict.supportSubject || parsed.intent === "support" || (verdict.needsHuman && intent === "account")) {
      const subject: SupportSubject = verdict.supportSubject ?? (intent === "account" ? "DONATION_ISSUE" : "COMPLAINT");
      const aboutDonation = verdict.supportSubject ? verdict.ticketAboutDonation || subject === "DONATION_ISSUE" : DONATION_WORDS.test(text);
      const res = supportFlow(ctx, answer || undefined, subject, ownDonation, { aboutDonation, draft: verdict.ticketDraft.trim() || text });
      const extra = intent === "account" || parsed.intent === "account" ? donorActions(ctx, text, res.actions) : [];
      return { ...res, actions: [...extra, ...res.actions] };
    }
    if (intent === "account" && !ctx.donor) return accountFlow(ctx, answer || undefined);

    if (verdict.needsRuling) {
      const base = zakatFlow(ctx, answer || ctx.s.s_ruling);
      return { ...base, actions: [contact, ...base.actions], intent: "question", mode: "llm" };
    }

    /* Just talk: a question answered from the site's knowledge, a greeting,
       a doubt. One page to open if the model named one, the team if it could
       not answer, and a way into the projects so the door stays open. */
    if (verdict.mode === "answer" || (!verdict.recommendedIds.length && answer && intent !== "zakat" && intent !== "waqf")) {
      /* Only what fits this reply: a page the model named, the donor's own
         documents, the team when needed. No standing "browse projects" —
         the suggestion below is the tailored next step. */
      const actions: ConciergeAction[] = [];
      if (routeAction) actions.push(routeAction);
      if (intent === "account" || parsed.intent === "account") actions.push(...donorActions(ctx, text, actions));
      if (verdict.needsHuman) actions.push(contact);
      const effective: ConciergeIntent = intent ?? "question";
      /* Never a dead end: one next step, the model's if it fits a real
         candidate, else the one that fits the intent. */
      /* A generic "shall I show you the areas?" is overridden when the
         message itself named something closer: a place → that place's top
         project; waqf, zakat or regular giving → that flow. */
      let kind: SuggestionKind = verdict.suggestion.kind;
      let kindCampaignId: string | null = verdict.suggestion.campaignId;
      let kindText: string | null = verdict.suggestion.text.trim() || null;
      if (kind === "campaign" && !candidates.some((c) => c.id === kindCampaignId)) kind = "category";
      if (kind === "category" || (kind === "none" && !verdict.needsHuman)) {
        const topic = intent ?? parsed.intent ?? null;
        const place = parsed.region ?? ctx.state.region ?? null;
        if (topic === "waqf" || topic === "zakat" || topic === "recurring") { kind = topic; kindCampaignId = null; kindText = null; }
        else if (place && candidates.some((c) => c.regionSlug === `region-${place}` || c.categorySlugs.includes(`region-${place}`))) { kind = "campaign"; kindCampaignId = candidates.find((c) => c.regionSlug === `region-${place}` || c.categorySlugs.includes(`region-${place}`))?.id ?? null; kindText = null; }
        else if (kind === "none") kind = "category";
      }
      const suggested = verdict.needsHuman && kind === "none" ? null : suggestionBlock(ctx, kind, kindCampaignId, kindText, candidates) ?? fallbackSuggestion(ctx, intent ?? ctx.state.intent ?? null, candidates);
      /* A "browse projects" link is redundant under a specific project suggestion. */
      if (suggested?.type === "suggestion" && suggested.campaign) {
        const i = actions.findIndex((a) => a.type === "navigate" && a.route === "projects");
        if (i !== -1) actions.splice(i, 1);
      }
      const blocks: ConciergeBlock[] = [];
      if (intent === "account" && ctx.donor) {
        /* Their own numbers under an account answer, so the reply is checkable. */
        const summary = accountFlow(ctx).blocks.find((b) => b.type === "donor_summary");
        if (summary) blocks.push(summary);
      }
      if (suggested) blocks.push(suggested);
      return respond(ctx, { message: answer || verdict.message, blocks, actions, mode: "llm", intent: effective, state: { intent: effective === "question" ? ctx.state.intent : effective } });
    }

    const lead = [answer, verdict.message.trim()].filter(Boolean).join("\n\n");
    const withHuman = (res: ConciergeResponse): ConciergeResponse => (verdict.needsHuman ? { ...res, actions: [contact, ...res.actions] } : res);

    if (intent === "zakat") return withHuman({ ...zakatFlow(ctx, lead || undefined), mode: "llm" });
    if (intent === "waqf") return withHuman({ ...waqfFlow(ctx, lead || undefined), mode: "llm" });
    if (intent === "current_page" && ctx.current) return withHuman({ ...currentPageFlow(ctx), message: lead || ctx.s.s_current || "", mode: "llm" });
    const allowed = new Set(candidates.map((c) => c.id));
    const ids = verdict.recommendedIds.filter((id) => allowed.has(id));
    const effective: ConciergeIntent = intent ?? "explore";
    const reasons = Object.fromEntries(verdict.reasons.filter((r) => allowed.has(r.id)).map((r) => [r.id, r.reason]));
    /* The wish was an area, not a project: everything in it, or the choice
       among the areas the model matched — only those it named, checked
       against the catalog. */
    if (ids.length === 0 && verdict.categorySlugs.length) {
      /* A kind of giving (sadaqah, zakat, waqf, regular) is not an area
         "about" orphans or water: when the words themselves reach real
         projects, those win over generic types the model reached for. */
      const generic = new Set(["type-sadaqah", "type-zakat", "type-waqf", "type-recurring"]);
      const slugs = strongCampaigns.length ? verdict.categorySlugs.filter((slug) => !generic.has(slug)) : verdict.categorySlugs;
      const catIds = slugs.map((slug) => ctx.catalog.categories.find((c) => c.slug === slug)?.id).filter((id): id is string => Boolean(id));
      const res = catIds.length
        ? topicFlow({ ...ctx, state: { ...ctx.state, intent: effective } }, lead || undefined, [], catIds)
        : topical(lead || undefined, reasons);
      if (res) return withHuman(res);
    }
    /* The visitor named two or more areas ("Gaza or Syria"): the choice is
       theirs, whatever projects the model picked from one of them. */
    if (topic?.kind === "categories" && topic.named) {
      const res = topical(lead || undefined);
      if (res) return withHuman(res);
    }
    /* Several projects fit: all of them, not a cut at three. */
    if (ids.length > 3) {
      const res = topicFlow({ ...ctx, state: { ...ctx.state, intent: effective } }, lead || undefined, ids, [], reasons);
      if (res) return withHuman(res);
    }
    if (ids.length === 0 && lead) {
      /* The model asked a clarifying question. For a cause the visitor did
         name, the deterministic candidates go under the question so there is
         still something to act on; otherwise the quick-intent chips do. */
      const recommendable: ConciergeIntent[] = ["sadaqah_jariyah", "relief", "recurring", "gift", "most_needed"];
      if (recommendable.includes(effective)) return withHuman(recommendFlow(ctx, effective, lead));
      const actions = [...(routeAction ? [routeAction] : []), ...chips(ctx.s)];
      return withHuman(respond(ctx, { message: lead, blocks: [], actions, mode: "llm", intent: effective, state: { intent: effective } }));
    }
    return withHuman(recommendFlow(ctx, effective, lead || undefined, reasons, ids.length ? ids : undefined, budgetStated));
  }

  /* Model off or unusable: the deterministic reading answers. */
  if (intent === "support") return supportFlow(ctx, undefined, DONATION_WORDS.test(text) ? "DONATION_ISSUE" : "COMPLAINT", null, { aboutDonation: DONATION_WORDS.test(text), draft: text });
  if (intent === "account") return accountFlow(ctx);
  if (intent === "zakat") return zakatFlow(ctx);
  if (intent === "waqf") return waqfFlow(ctx);
  if (intent === "current_page") return currentPageFlow(ctx);
  const effective: ConciergeIntent = intent ?? ctx.state.intent ?? "explore";
  const topicalRes = topical();
  if (topicalRes) return topicalRes;
  const res = recommendFlow(ctx, effective, undefined, undefined, undefined, Boolean(parsed.amount));
  if (!intent && !ctx.state.intent) {
    /* Nothing recognisable and no model to read it: the nearest projects,
       and the team for whatever the visitor actually needed. */
    res.message = `${ctx.s.s_no_results ?? ""} ${res.message}`.trim();
  }
  return res;
}

/* ── Entry ───────────────────────────────────────────────────────────────── */

export async function runConcierge(req: ConciergeRequest, opts: { userId?: string | null } = {}): Promise<ConciergeResponse> {
  const locale = req.locale;
  const [catalog, donor] = await Promise.all([
    loadCatalog(locale),
    opts.userId ? loadDonorContext(opts.userId, locale).catch((error) => {
      console.error("[concierge] donor context failed", error instanceof Error ? error.message : error);
      return null;
    }) : Promise.resolve(null),
  ]);
  const s = stringsFor(locale);
  const current = req.page?.projectSlug ? catalog.campaigns.find((c) => c.slug === req.page?.projectSlug || c.id === req.page?.projectSlug) ?? null : null;
  const ctx: Ctx = { req, locale, s, catalog, state: { ...(req.state ?? {}) }, current, donor };

  if (req.step) {
    switch (req.step.kind) {
      case "open":
        return welcome(ctx);
      case "intent":
        if (req.step.intent === "support") return supportFlow(ctx);
        if (req.step.intent === "account") return accountFlow(ctx);
        if (req.step.intent === "zakat") return zakatFlow(ctx);
        if (req.step.intent === "waqf") return waqfFlow(ctx);
        if (req.step.intent === "current_page") return currentPageFlow(ctx);
        if (req.step.intent === "explore") return categoryFlow({ ...ctx, state: { ...ctx.state, amountUSD: null, amountTurn: null, frequency: null, region: null, giftRecipientName: null, selectedCampaignId: null, shownCampaignIds: [] } });
        /* A chip is a fresh direction: what was said for the previous one —
           amount, cadence, place, dedication, chosen project — is let go. */
        return recommendFlow(
          {
            ...ctx,
            state: { ...ctx.state, intent: req.step.intent, amountUSD: null, amountTurn: null, frequency: null, region: null, giftRecipientName: null, selectedCampaignId: null, shownCampaignIds: [] },
          },
          req.step.intent
        );
      case "select_campaign":
        return selectCampaignFlow(ctx, req.step.campaignId);
      case "select_category":
        return selectCategoryFlow(ctx, req.step.categoryId);
      case "show_more":
        return recommendFlow(ctx, ctx.state.intent ?? "explore");
      case "added":
        return addedFlow(ctx, req.step);
    }
  }
  return messageFlow(ctx, req.message ?? "");
}
