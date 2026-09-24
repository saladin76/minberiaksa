import { z } from "zod";

/**
 * The donation concierge's wire contract — what the browser sends, what the
 * server returns, and the one shape the model is allowed to answer in.
 *
 * Everything the visitor sees is one of the typed blocks below, built on the
 * server from catalog facts. The model never emits UI; it emits a small JSON
 * verdict (`LlmVerdict`) that is validated here before anything is rendered.
 * Anything that fails validation is discarded and the deterministic path
 * answers instead — a malformed model reply can never reach the screen.
 */

export const CONCIERGE_INTENTS = [
  "sadaqah_jariyah",
  "relief",
  "zakat",
  "waqf",
  "recurring",
  "gift",
  "explore",
  "most_needed",
  "current_page",
  "question",
  "unknown",
] as const;
export type ConciergeIntent = (typeof CONCIERGE_INTENTS)[number];

export const FREQUENCIES = ["once", "daily", "friday", "monthly"] as const;
export type ConciergeFrequency = (typeof FREQUENCIES)[number];

/** Which page the visitor opened the assistant on; only public identifiers. */
export const pageContextSchema = z.object({
  route: z.string().max(40).nullable().optional(),
  projectSlug: z.string().max(200).nullable().optional(),
  categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable().optional(),
  pathname: z.string().max(300).nullable().optional(),
});
export type PageContext = z.infer<typeof pageContextSchema>;

/** What the assistant already knows about this visit — carried by the client, never trusted for prices. */
export const conversationStateSchema = z.object({
  intent: z.enum(CONCIERGE_INTENTS).nullable().optional(),
  amountUSD: z.number().positive().max(1_000_000).nullable().optional(),
  frequency: z.enum(FREQUENCIES).nullable().optional(),
  region: z.string().max(60).nullable().optional(),
  selectedCampaignId: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable().optional(),
  giftRecipientName: z.string().max(120).nullable().optional(),
  /** Campaign ids already shown, so "show me another" does not repeat them. */
  shownCampaignIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).max(30).optional(),
  /** Campaign ids currently in the basket, so cross-sell never repeats one. */
  cartCampaignIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).max(50).optional(),
  turns: z.number().int().min(0).max(50).optional(),
});
export type ConversationState = z.infer<typeof conversationStateSchema>;

export const historyTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(1200),
});

/** A deterministic step the client asks for without free text. */
export const stepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("open") }),
  z.object({ kind: z.literal("intent"), intent: z.enum(CONCIERGE_INTENTS) }),
  z.object({ kind: z.literal("select_campaign"), campaignId: z.string().regex(/^[0-9a-fA-F]{24}$/) }),
  z.object({ kind: z.literal("select_category"), categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/) }),
  z.object({ kind: z.literal("show_more") }),
  z.object({
    kind: z.literal("added"),
    campaignId: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable().optional(),
    categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable().optional(),
    amountUSD: z.number().positive().max(1_000_000),
    frequency: z.enum(FREQUENCIES),
    gift: z.boolean().optional(),
    waqf: z.boolean().optional(),
  }),
]);
export type ConciergeStep = z.infer<typeof stepSchema>;

export const conciergeRequestSchema = z
  .object({
    sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    locale: z.string().min(2).max(5),
    currency: z.string().min(3).max(3).optional(),
    page: pageContextSchema.optional(),
    state: conversationStateSchema.optional(),
    history: z.array(historyTurnSchema).max(8).optional(),
    message: z.string().trim().min(1).max(600).optional(),
    step: stepSchema.optional(),
  })
  .refine((v) => Boolean(v.message) || Boolean(v.step), { message: "message or step required" });
export type ConciergeRequest = z.infer<typeof conciergeRequestSchema>;

/* ── What the server renders ───────────────────────────────────────────── */

export const campaignCardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  image: z.string().nullable(),
  regionLabel: z.string().nullable(),
  /** Localized, factual one-liner from the model or a template. */
  why: z.string().nullable(),
  raisedUSD: z.number(),
  goalUSD: z.number().nullable(),
  suggestedAmountsUSD: z.array(z.number()),
  supportsShares: z.boolean(),
  sharePriceUSD: z.number().nullable(),
});
export type CampaignCard = z.infer<typeof campaignCardSchema>;

export const categoryCardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  kind: z.enum(["region", "type", "other"]),
  projectCount: z.number(),
  canDonateDirectly: z.boolean(),
});
export type CategoryCard = z.infer<typeof categoryCardSchema>;

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), label: z.string(), route: z.string(), extra: z.array(z.string()).optional(), track: z.string().optional() }),
  z.object({ type: z.literal("intent"), label: z.string(), intent: z.enum(CONCIERGE_INTENTS) }),
  z.object({ type: z.literal("select_campaign"), label: z.string(), campaignId: z.string() }),
  z.object({ type: z.literal("select_category"), label: z.string(), categoryId: z.string() }),
  z.object({ type: z.literal("show_more"), label: z.string() }),
  z.object({ type: z.literal("configure"), label: z.string(), campaignId: z.string().nullable(), categoryId: z.string().nullable() }),
  z.object({ type: z.literal("open_cart"), label: z.string() }),
  z.object({ type: z.literal("checkout"), label: z.string() }),
]);
export type ConciergeAction = z.infer<typeof actionSchema>;

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("campaign_recommendations"), campaigns: z.array(campaignCardSchema).max(4) }),
  z.object({ type: z.literal("category_options"), categories: z.array(categoryCardSchema).max(6) }),
  z.object({
    type: z.literal("donation_configuration"),
    campaign: campaignCardSchema.nullable(),
    category: categoryCardSchema.nullable(),
    /** Generic destination when neither a campaign nor a category is chosen. */
    genericTitleKey: z.string().nullable(),
    typeKey: z.enum(["project", "zakat"]),
    suggestedAmountsUSD: z.array(z.number()).min(1),
    presetAmountUSD: z.number().nullable(),
    frequencies: z.array(z.enum(FREQUENCIES)).min(1),
    presetFrequency: z.enum(FREQUENCIES).nullable(),
    allowGift: z.boolean(),
    giftRecipientName: z.string().nullable(),
  }),
  z.object({
    type: z.literal("waqf_options"),
    units: z.array(z.object({ unit: z.enum(["share", "meter"]), priceUSD: z.number(), sharesPerUnit: z.number() })),
  }),
  z.object({ type: z.literal("zakat_card"), zakatCategoryId: z.string().nullable(), rate: z.number() }),
  z.object({ type: z.literal("cart_confirmation"), title: z.string(), amountUSD: z.number(), frequency: z.enum(FREQUENCIES) }),
  z.object({ type: z.literal("cross_sell"), campaign: campaignCardSchema, suggestedAmountsUSD: z.array(z.number()).min(1) }),
  z.object({ type: z.literal("notice"), tone: z.enum(["info", "warning"]), text: z.string() }),
]);
export type ConciergeBlock = z.infer<typeof blockSchema>;

export const conciergeResponseSchema = z.object({
  message: z.string(),
  blocks: z.array(blockSchema).max(4),
  actions: z.array(actionSchema).max(8),
  state: conversationStateSchema,
  /** "llm" when the wording came from the model, "deterministic" otherwise. */
  mode: z.enum(["llm", "deterministic"]),
  intent: z.enum(CONCIERGE_INTENTS),
});
export type ConciergeResponse = z.infer<typeof conciergeResponseSchema>;

/* ── The one shape the model may answer in ─────────────────────────────── */

export const llmVerdictSchema = z.object({
  intent: z.enum(CONCIERGE_INTENTS),
  amount: z.number().positive().max(1_000_000).nullable(),
  /** ISO 4217 the visitor named, if any. */
  currency: z.string().length(3).nullable(),
  frequency: z.enum(FREQUENCIES).nullable(),
  region: z.string().max(60).nullable(),
  giftRecipientName: z.string().max(120).nullable(),
  /** Subset of the candidate ids the server offered; anything else is dropped. */
  recommendedIds: z.array(z.string()).max(4),
  /** One factual reason per recommended id, in the visitor's language. (An
      array, not a map: strict JSON schemas take no free-form object keys.) */
  reasons: z.array(z.object({ id: z.string(), reason: z.string().max(220) })).max(4),
  /** One or two sentences in the visitor's language. No facts beyond the candidates. */
  message: z.string().max(600),
  /** Whether the reply needs a religious ruling the assistant must not give. */
  needsRuling: z.boolean(),
});
export type LlmVerdict = z.infer<typeof llmVerdictSchema>;

/** JSON schema handed to the Responses API as `text.format` (strict). */
export const LLM_VERDICT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: "string", enum: [...CONCIERGE_INTENTS] },
    amount: { type: ["number", "null"] },
    currency: { type: ["string", "null"] },
    frequency: { type: ["string", "null"], enum: [...FREQUENCIES, null] },
    region: { type: ["string", "null"] },
    giftRecipientName: { type: ["string", "null"] },
    recommendedIds: { type: "array", items: { type: "string" } },
    reasons: {
      type: "array",
      items: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id", "reason"] },
    },
    message: { type: "string" },
    needsRuling: { type: "boolean" },
  },
  required: ["intent", "amount", "currency", "frequency", "region", "giftRecipientName", "recommendedIds", "reasons", "message", "needsRuling"],
} as const;
