import { isKnownLocale } from "@/lib/locales";
import type { CommunicationChannel, CommunicationPurpose } from "./communication-types";

/**
 * Pure sender routing. Given a channel + recipient locale/country + message purpose,
 * pick the best configured sender, honouring explicit routing rules first, then sender
 * capability, priority, status and health, with an explicit fallback. No DB, no I/O —
 * senders/rules are passed in so this stays testable and reusable across the app.
 *
 * If nothing matches, returns `{ skipped: true, reason }` — the caller must NOT send.
 */

export type SenderStatus = "ACTIVE" | "DISABLED" | "NEEDS_ATTENTION";
export type SenderHealth = "HEALTHY" | "DEGRADED" | "UNKNOWN";

export type CommunicationSenderConfig = {
  id: string;
  channel: CommunicationChannel;
  provider: string; // runtime provider id (META_WHATSAPP | TWILIO | SENDGRID | NETGSM | CUSTOM)
  name: string;
  supportedLocales?: string[] | null; // empty/undefined = any locale
  supportedCountries?: string[] | null; // empty/undefined = any country
  supportedPurposes?: string[] | null; // empty/undefined = any purpose (MARKETING|UTILITY|TRANSACTIONAL|AUTHENTICATION)
  status: SenderStatus;
  health?: SenderHealth;
  isDefault?: boolean;
  enabled: boolean;
  priority?: number; // lower = preferred
};

export type SenderRoutingRuleConfig = {
  channel: CommunicationChannel;
  locale?: string | null;
  country?: string | null;
  purpose?: string | null; // MARKETING | UTILITY | TRANSACTIONAL | AUTHENTICATION
  senderId: string;
  fallbackSenderId?: string | null;
  priority?: number;
  enabled: boolean;
};

export type SenderRoutingRequest = {
  channel: CommunicationChannel;
  locale?: string | null;
  country?: string | null;
  purpose: CommunicationPurpose;
};

export type SenderRoutingResult =
  | { sender: CommunicationSenderConfig; matchedBy: "rule" | "capability" | "default" }
  | { skipped: true; reason: string };

function normLocale(value?: string | null): string | null {
  const code = value?.trim().toLowerCase();
  return code && isKnownLocale(code) ? code : null;
}

function normCountry(value?: string | null): string | null {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
}

function isUsable(sender: CommunicationSenderConfig): boolean {
  return sender.enabled && sender.status === "ACTIVE" && sender.health !== "DEGRADED";
}

function supportsLocale(sender: CommunicationSenderConfig, locale: string | null): boolean {
  if (!sender.supportedLocales || sender.supportedLocales.length === 0) return true;
  if (!locale) return true;
  return sender.supportedLocales.map((l) => l.toLowerCase()).includes(locale);
}

function supportsCountry(sender: CommunicationSenderConfig, country: string | null): boolean {
  if (!sender.supportedCountries || sender.supportedCountries.length === 0) return true;
  if (!country) return true;
  return sender.supportedCountries.map((c) => c.toUpperCase()).includes(country);
}

function supportsPurpose(sender: CommunicationSenderConfig, purpose: CommunicationPurpose): boolean {
  if (!sender.supportedPurposes || sender.supportedPurposes.length === 0) return true;
  return sender.supportedPurposes.includes(purpose);
}

function byPriority(a: CommunicationSenderConfig, b: CommunicationSenderConfig): number {
  const pa = a.priority ?? 100;
  const pb = b.priority ?? 100;
  if (pa !== pb) return pa - pb;
  return (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0);
}

/**
 * Score how specifically a rule matches the request (higher = more specific).
 * Returns null when the rule conflicts with the request. Channel is filtered by the
 * caller, so it is not scored here.
 */
function ruleScore(rule: SenderRoutingRuleConfig, req: { locale: string | null; country: string | null; purpose: CommunicationPurpose }): number | null {
  let score = 0;
  const ruleLocale = normLocale(rule.locale);
  const ruleCountry = normCountry(rule.country);
  if (ruleLocale) {
    if (ruleLocale !== req.locale) return null;
    score += 4;
  }
  if (ruleCountry) {
    if (ruleCountry !== req.country) return null;
    score += 2;
  }
  if (rule.purpose) {
    if (rule.purpose !== req.purpose) return null;
    score += 1;
  }
  return score;
}

export function resolveSender(
  request: SenderRoutingRequest,
  senders: CommunicationSenderConfig[],
  rules: SenderRoutingRuleConfig[] = []
): SenderRoutingResult {
  const locale = normLocale(request.locale);
  const country = normCountry(request.country);
  const byId = new Map(senders.map((s) => [s.id, s]));

  const channelSenders = senders.filter((s) => s.channel === request.channel);
  if (channelSenders.length === 0) {
    return { skipped: true, reason: `NO_SENDER_FOR_CHANNEL_${request.channel}` };
  }

  // 1) Explicit routing rules, most specific first.
  const candidateRules = rules
    .filter((r) => r.enabled && r.channel === request.channel)
    .map((r) => ({ rule: r, score: ruleScore(r, { locale, country, purpose: request.purpose }) }))
    .filter((entry): entry is { rule: SenderRoutingRuleConfig; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || (a.rule.priority ?? 100) - (b.rule.priority ?? 100));

  for (const { rule } of candidateRules) {
    const primary = byId.get(rule.senderId);
    if (primary && isUsable(primary)) return { sender: primary, matchedBy: "rule" };
    const fallback = rule.fallbackSenderId ? byId.get(rule.fallbackSenderId) : undefined;
    if (fallback && isUsable(fallback)) return { sender: fallback, matchedBy: "rule" };
  }

  // 2) Capability match (locale + country + purpose), by priority.
  const capable = channelSenders
    .filter(isUsable)
    .filter((s) => supportsLocale(s, locale) && supportsCountry(s, country) && supportsPurpose(s, request.purpose))
    .sort(byPriority);
  if (capable.length > 0) return { sender: capable[0], matchedBy: "capability" };

  // 3) Default sender for the channel.
  const fallbackDefault = channelSenders.filter(isUsable).sort(byPriority).find((s) => s.isDefault);
  if (fallbackDefault) return { sender: fallbackDefault, matchedBy: "default" };

  return { skipped: true, reason: "NO_SENDER_AVAILABLE" };
}
