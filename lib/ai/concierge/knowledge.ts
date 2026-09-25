import "server-only";

import { messagesFor } from "@/i18n/locale-messages";
import { listFaqs } from "@/lib/minbar/cms";
import { WAQF_UNIT_PRICE_USD } from "@/lib/minbar/waqf";

/**
 * What the concierge is allowed to *say* about the site, beyond the campaign
 * catalog: the organisation's own About copy, the published FAQ rows, and a
 * short list of how-giving-works facts that are true by construction of the
 * code (payment rails, receipts, cadences, waqf units, gifts). Everything is
 * localized through the same message bundles and translation tables the pages
 * render, and the model is told to answer from this and nothing else.
 *
 * Cached per locale for a few minutes, like the catalog.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_FAQS = 30;
const MAX_FAQ_ANSWER = 320;

export interface KnowledgePack {
  locale: string;
  /** Lines the prompt prints under ORGANISATION. */
  organisation: string[];
  /** Lines the prompt prints under HOW_GIVING_WORKS. */
  giving: string[];
  faqs: Array<{ q: string; a: string }>;
  /** Route name → localized label, for the model's suggested page. */
  routeLabels: Record<string, string>;
  loadedAt: number;
}

const cache = new Map<string, KnowledgePack>();

function str(ns: unknown, key: string): string {
  const v = ns && typeof ns === "object" ? (ns as Record<string, unknown>)[key] : undefined;
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Pages the model may point to, with the site's own navigation labels. */
export const SUGGESTABLE_ROUTES = ["projects", "zakat", "zakatCalculator", "waqf", "recurring", "about", "contact", "reports", "bankAccounts", "account", "volunteer", "partner", "blog"] as const;
export type SuggestableRoute = (typeof SUGGESTABLE_ROUTES)[number];

const ROUTE_NAV_KEY: Record<SuggestableRoute, string> = {
  projects: "projects",
  zakat: "zakat",
  zakatCalculator: "zakat",
  waqf: "waqf",
  recurring: "recurring",
  about: "about",
  contact: "contact",
  reports: "reports",
  bankAccounts: "bankAccounts",
  account: "account",
  volunteer: "volunteer",
  partner: "partner",
  blog: "blog",
};

export async function loadKnowledge(locale: string): Promise<KnowledgePack> {
  const hit = cache.get(locale);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit;

  const m = messagesFor(locale);
  const about = m.about;
  const nav = m.navigation;
  const common = m.common;
  const concierge = m.Concierge;

  const organisation = [
    str(about, "heroSubtitle"),
    str(about, "mission") && `Mission: ${str(about, "mission")}`,
    str(about, "howWeWork") && `How we work: ${str(about, "howWeWork")}`,
    str(about, "legalText") && `Legal: ${str(about, "legalText")}`,
    str(about, "pillar1Text") && `Work: ${[1, 2, 3, 4].map((i) => str(about, `pillar${i}Text`)).filter(Boolean).join(" · ")}`,
  ].filter((s): s is string => Boolean(s)).map((s) => clip(s, 360));

  /* Facts that the code guarantees; wording in English is fine — the model
     answers in the visitor's language and these are inputs, not output. */
  const giving = [
    "Donations go into a basket first; checkout asks for name, email and phone. No account is required (guest donations are allowed); a signed-in donor sees their donations and plans on the Account page.",
    "Payment methods: bank card through a secure certified gateway, or bank transfer to the organisation's published accounts (the donor uploads the transfer receipt and finance confirms it).",
    "The visitor can pick the display currency from the site's currency selector; amounts are converted at the day's rate and the charge is made in the checkout currency.",
    "After a confirmed payment the donor receives an official receipt and a thank-you certificate (PDF, also emailed), plus a waqf certificate for each waqf unit.",
    "Regular giving is available at three cadences: daily, every Friday, and monthly. It can be set on any project in the basket, changed or cancelled from the Account page.",
    `Waqf units: a waqf share costs $${WAQF_UNIT_PRICE_USD.share} and a waqf metre $${WAQF_UNIT_PRICE_USD.meter}; each unit has a certificate in the name the donor chooses (it can be on behalf of someone else, living or deceased).`,
    "Any project donation can be dedicated as a gift in someone else's name; the recipient can be told by email or WhatsApp with a certificate in their name.",
    "Zakat has its own page and calculator (2.5% of zakatable wealth above the nisab after a lunar year); the site spends zakat only on its approved categories. The assistant never issues religious rulings.",
    "Team support: at checkout the donor may add a small optional amount for the team's costs; it is never taken from the project donation.",
    "Projects are run by the foundation's field team with documented follow-up; reports and field videos are published on the site.",
    `Region and cause labels used on the site: ${[
      str(common, "regionGaza"), str(common, "regionSyria"), str(common, "regionSudan"),
    ].filter(Boolean).join(", ") || "Al-Quds, Gaza, Syria, Sudan, Yemen, Lebanon, Somalia, Africa, the Balkans"}.`,
  ];

  let faqs: Array<{ q: string; a: string }> = [];
  try {
    const rows = await listFaqs(locale);
    faqs = rows.slice(0, MAX_FAQS).map((f) => ({ q: clip(f.question.replace(/\s+/g, " ").trim(), 160), a: clip(f.answer.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), MAX_FAQ_ANSWER) }));
  } catch (error) {
    console.error("[concierge] FAQ load failed", error instanceof Error ? error.message : error);
  }

  const routeLabels: Record<string, string> = {};
  for (const route of SUGGESTABLE_ROUTES) {
    const label = str(nav, ROUTE_NAV_KEY[route]) || (route === "zakatCalculator" ? str(common, "zakatCalculator") : "");
    if (route === "zakatCalculator" && str(concierge, "a_calc")) routeLabels[route] = str(concierge, "a_calc");
    else if (label) routeLabels[route] = label;
  }

  const pack: KnowledgePack = { locale, organisation, giving, faqs, routeLabels, loadedAt: Date.now() };
  cache.set(locale, pack);
  return pack;
}
