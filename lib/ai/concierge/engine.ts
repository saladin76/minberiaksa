import "server-only";

import { messagesFor } from "@/i18n/locale-messages";
import { convertAmountInCurrencyToUsd, normalizeDonationCurrencyCode } from "@/lib/exchange/convert-amount-in-currency-to-usd";
import { DEFAULT_SUGGESTED_DONATION_AMOUNTS } from "@/lib/campaign/suggested-donations";
import { loadCatalog, type ConciergeCatalog } from "./catalog";
import { mentionsCurrentPage, parseMessage } from "./intent";
import { askModel } from "./llm";
import { loadKnowledge } from "./knowledge";
import { pickCrossSell, rankCampaigns, rankCategories, type CatalogCampaign, type CatalogCategory } from "./recommend";
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

interface Ctx {
  req: ConciergeRequest;
  locale: string;
  s: Strings;
  catalog: ConciergeCatalog;
  state: ConversationState;
  current: CatalogCampaign | null;
}

function recommendationBlock(ctx: Ctx, intent: ConciergeIntent, reasons?: Record<string, string>, ids?: string[]): { block: ConciergeBlock; shown: string[] } {
  const exclude = ctx.state.shownCampaignIds ?? [];
  let picked: CatalogCampaign[];
  if (ids?.length) {
    picked = ids.map((id) => ctx.catalog.campaigns.find((c) => c.id === id)).filter((c): c is CatalogCampaign => Boolean(c)).slice(0, 3);
  } else {
    picked = rankCampaigns(
      ctx.catalog.campaigns,
      { intent, region: ctx.state.region ?? null, amountUSD: ctx.state.amountUSD ?? null, text: null, excludeIds: exclude, currentCampaignId: ctx.current?.id ?? null },
      3
    ).map((r) => r.campaign);
  }
  const cards = picked.map((c) => toCard(c, reasons?.[c.id] ?? templateWhy(ctx.s, ctx.locale, c, intent)));
  return { block: { type: "campaign_recommendations", campaigns: cards }, shown: picked.map((c) => c.id) };
}

function configurationBlock(ctx: Ctx, campaign: CatalogCampaign | null, category: CatalogCategory | null, typeKey: "project" | "zakat", genericTitleKey: string | null): ConciergeBlock {
  const preset = ctx.state.amountUSD ?? null;
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
  return respond(ctx, { message: ctx.s.s_welcome ?? "", blocks: [], actions, mode: "deterministic", intent: "unknown" });
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

function recommendFlow(ctx: Ctx, intent: ConciergeIntent, message?: string, reasons?: Record<string, string>, ids?: string[]): ConciergeResponse {
  const effective = intent === "unknown" || intent === "question" ? "explore" : intent;
  const { block, shown } = recommendationBlock(ctx, effective, reasons, ids);
  const blocks: ConciergeBlock[] = [];
  if (block.type === "campaign_recommendations" && block.campaigns.length === 0) {
    const cats = rankCategories(ctx.catalog.categories, effective, 4).map(toCategoryCard);
    blocks.push({ type: "category_options", categories: cats });
  } else {
    blocks.push(block);
  }
  const budget = ctx.state.amountUSD ? `${fill(ctx.s.s_budget, { amount: fmtUsd(ctx.locale, ctx.state.amountUSD) })} ` : "";
  const text = message ?? `${budget}${ctx.s[INTENT_MESSAGE_KEY[effective] ?? "s_intent_explore"] ?? ""}`;
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
  const picked = rankCampaigns(inCategory, { intent: ctx.state.intent ?? null, region: null, amountUSD: ctx.state.amountUSD ?? null, text: null }, 3).map((r) => r.campaign);
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
  if (parsed.amount) next.amountUSD = await toUsd(parsed.amount, parsed.currency, ctx.req.currency);
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

  const poolIntent = intent ?? ctx.state.intent ?? null;
  const candidates = rankCampaigns(
    ctx.catalog.campaigns,
    { intent: poolIntent, region: ctx.state.region ?? null, amountUSD: ctx.state.amountUSD ?? null, text, currentCampaignId: ctx.current?.id ?? null },
    8
  ).map((r) => r.campaign);

  const knowledge = await loadKnowledge(ctx.locale);
  const outcome = await askModel({
    locale: ctx.locale,
    message: text,
    history: ctx.req.history ?? [],
    candidates,
    categories: ctx.catalog.categories.filter((c) => c.kind === "type"),
    parsed: {
      intent: poolIntent,
      amount: ctx.state.amountUSD ?? null,
      currency: "USD",
      frequency: ctx.state.frequency ?? null,
      region: ctx.state.region ?? null,
      recurringNudged: ctx.state.recurringNudged === true,
      route: ctx.req.page?.route ?? null,
    },
    currentCampaign: ctx.current,
    waqf: ctx.catalog.waqf,
    knowledge,
  });
  const verdict = outcome.verdict;

  if (verdict) {
    intent = intent ?? verdict.intent;
    if (!ctx.state.amountUSD && verdict.amount) ctx.state.amountUSD = await toUsd(verdict.amount, verdict.currency, ctx.req.currency);
    if (!ctx.state.frequency && verdict.frequency) ctx.state.frequency = verdict.frequency;
    if (!ctx.state.giftRecipientName && verdict.giftRecipientName) ctx.state.giftRecipientName = verdict.giftRecipientName;
    /* The one regular-giving mention is spent on the first model reply that
       could have carried it; the prompt never repeats it after this. */
    if (!ctx.state.recurringNudged && verdict.mode !== "answer" && intent !== "recurring" && intent !== "zakat") ctx.state.recurringNudged = true;

    const contact: ConciergeAction = { type: "navigate", label: ctx.s.a_contact ?? "", route: "contact" };
    const routeAction: ConciergeAction | null =
      verdict.route && verdict.route !== "contact" && knowledge.routeLabels[verdict.route]
        ? { type: "navigate", label: knowledge.routeLabels[verdict.route], route: verdict.route, track: verdict.route === "zakatCalculator" ? "zakat_started" : verdict.route === "waqf" ? "waqf_started" : undefined }
        : null;
    const answer = verdict.answer.trim();

    if (verdict.needsRuling) {
      const base = zakatFlow(ctx, answer || ctx.s.s_ruling);
      return { ...base, actions: [contact, ...base.actions], intent: "question", mode: "llm" };
    }

    /* Just talk: a question answered from the site's knowledge, a greeting,
       a doubt. One page to open if the model named one, the team if it could
       not answer, and a way into the projects so the door stays open. */
    if (verdict.mode === "answer" || (!verdict.recommendedIds.length && answer && intent !== "zakat" && intent !== "waqf")) {
      const actions: ConciergeAction[] = [];
      if (routeAction) actions.push(routeAction);
      if (verdict.needsHuman) actions.push(contact);
      if (!routeAction || routeAction.route !== "projects") actions.push({ type: "navigate", label: ctx.s.a_projects ?? "", route: "projects" });
      const effective: ConciergeIntent = intent ?? "question";
      return respond(ctx, { message: answer || verdict.message, blocks: [], actions, mode: "llm", intent: effective, state: { intent: effective === "question" ? ctx.state.intent : effective } });
    }

    const lead = [answer, verdict.message.trim()].filter(Boolean).join("\n\n");
    const withHuman = (res: ConciergeResponse): ConciergeResponse => (verdict.needsHuman ? { ...res, actions: [contact, ...res.actions] } : res);

    if (intent === "zakat") return withHuman({ ...zakatFlow(ctx, lead || undefined), mode: "llm" });
    if (intent === "waqf") return withHuman({ ...waqfFlow(ctx, lead || undefined), mode: "llm" });
    if (intent === "current_page" && ctx.current) return withHuman({ ...currentPageFlow(ctx), message: lead || ctx.s.s_current || "", mode: "llm" });
    const allowed = new Set(candidates.map((c) => c.id));
    const ids = verdict.recommendedIds.filter((id) => allowed.has(id));
    const effective: ConciergeIntent = intent ?? "explore";
    if (ids.length === 0 && lead) {
      /* The model asked a clarifying question. For a cause the visitor did
         name, the deterministic candidates go under the question so there is
         still something to act on; otherwise the quick-intent chips do. */
      const recommendable: ConciergeIntent[] = ["sadaqah_jariyah", "relief", "recurring", "gift", "most_needed"];
      if (recommendable.includes(effective)) return withHuman(recommendFlow(ctx, effective, lead));
      const actions = [...(routeAction ? [routeAction] : []), ...chips(ctx.s)];
      return withHuman(respond(ctx, { message: lead, blocks: [], actions, mode: "llm", intent: effective, state: { intent: effective } }));
    }
    const reasons = Object.fromEntries(verdict.reasons.filter((r) => allowed.has(r.id)).map((r) => [r.id, r.reason]));
    return withHuman(recommendFlow(ctx, effective, lead || undefined, reasons, ids.length ? ids : undefined));
  }

  /* Model off or unusable: the deterministic reading answers. */
  if (intent === "zakat") return zakatFlow(ctx);
  if (intent === "waqf") return waqfFlow(ctx);
  if (intent === "current_page") return currentPageFlow(ctx);
  const effective: ConciergeIntent = intent ?? ctx.state.intent ?? "explore";
  const res = recommendFlow(ctx, effective);
  if (!intent && !ctx.state.intent) {
    /* Nothing recognisable and no model to read it: the nearest projects,
       and the team for whatever the visitor actually needed. */
    res.message = `${ctx.s.s_no_results ?? ""} ${res.message}`.trim();
    res.actions = [{ type: "navigate", label: ctx.s.a_contact ?? "", route: "contact" }, ...res.actions];
  }
  return res;
}

/* ── Entry ───────────────────────────────────────────────────────────────── */

export async function runConcierge(req: ConciergeRequest): Promise<ConciergeResponse> {
  const locale = req.locale;
  const catalog = await loadCatalog(locale);
  const s = stringsFor(locale);
  const current = req.page?.projectSlug ? catalog.campaigns.find((c) => c.slug === req.page?.projectSlug || c.id === req.page?.projectSlug) ?? null : null;
  const ctx: Ctx = { req, locale, s, catalog, state: { ...(req.state ?? {}) }, current };

  if (req.step) {
    switch (req.step.kind) {
      case "open":
        return welcome(ctx);
      case "intent":
        if (req.step.intent === "zakat") return zakatFlow(ctx);
        if (req.step.intent === "waqf") return waqfFlow(ctx);
        if (req.step.intent === "current_page") return currentPageFlow(ctx);
        return recommendFlow({ ...ctx, state: { ...ctx.state, intent: req.step.intent } }, req.step.intent);
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
