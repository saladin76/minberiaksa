import "server-only";

import { listSenders, toSenderConfig } from "./sender-service";
import { listRoutingRules, toRoutingRuleConfig } from "./routing-rule-service";
import { resolveSender } from "./sender-router";
import { getActiveCommunicationRuntimeBundle, type CommunicationRuntimeBundle } from "./runtime-config";
import type { CommunicationChannelId, CommunicationPurposeId } from "./communication-runtime-types";
import type { CommunicationChannel, CommunicationPurpose } from "./communication-types";

/**
 * One sender decision for every outbound path.
 *
 * Two problems met here. The first: a routing decision could be overruled after the fact. The
 * router already ends in its own default step, so `{ skipped }` means "these rules deliberately
 * have nobody for this recipient" — yet the campaign executor answered that by reaching for
 * `runtime.meta.values.defaultPhoneNumberId` and sending anyway. A rule saying "no sender serves
 * France for marketing" then produced a French marketing message from the default number, which is
 * the precise outcome the rule existed to prevent.
 *
 * The second: the paths disagreed. Campaigns routed by locale/country/purpose; automatic triggers
 * took `senders.find(first enabled with a phone number)`; retries and gift messages inherited the
 * trigger's choice. The same donor could therefore be messaged from two different business numbers
 * depending on which code path produced the message — and WhatsApp threads are per-number, so that
 * splits one conversation in two.
 *
 * The contract now:
 *
 *  · Routing is attempted for every send, with the recipient's locale, country and the message's
 *    purpose — campaign, trigger, retry and gift alike.
 *  · A router skip is FINAL. No environment fallback rescues it.
 *  · The environment default stands in only when sender management is not set up at all — no
 *    sender rows exist for the channel. That is the bootstrap case (the platform configured by
 *    environment variables before anyone has created a sender), not an override, and it is
 *    reported as `matchedBy: "runtime-default"` so it is visible in the delivery record.
 */

export type ResolvedSender = {
  id: string | null;
  provider: string | null;
  phoneNumberId: string | null;
  senderEmail: string | null;
  smsSender: string | null;
  displayPhoneNumber: string | null;
};

export type SenderResolution =
  | { ok: true; sender: ResolvedSender; matchedBy: "rule" | "capability" | "default" | "runtime-default" }
  | { ok: false; reason: string };

/**
 * Senders and rules read once and reused across a batch. A campaign sending to 3,000 recipients
 * must not re-read the sender table per message, and every recipient must be routed against the
 * same snapshot — a rule edited mid-send should not split one campaign across two policies.
 */
export type SenderRoutingSnapshot = {
  channel: CommunicationChannelId;
  senders: ReturnType<typeof toSenderConfig>[];
  rules: ReturnType<typeof toRoutingRuleConfig>[];
  raw: Map<string, Awaited<ReturnType<typeof listSenders>>[number]>;
  /** True when the channel has no sender rows at all — the only case the env default may serve. */
  channelHasNoSenders: boolean;
  runtime: CommunicationRuntimeBundle;
};

export async function loadSenderRoutingSnapshot(
  channel: CommunicationChannelId,
  runtime?: CommunicationRuntimeBundle,
): Promise<SenderRoutingSnapshot> {
  const [senders, rules, bundle] = await Promise.all([
    listSenders().catch(() => []),
    listRoutingRules(channel).catch(() => []),
    runtime ? Promise.resolve(runtime) : getActiveCommunicationRuntimeBundle(),
  ]);
  const channelSenders = senders.filter((sender) => sender.channel === channel);
  return {
    channel,
    senders: channelSenders.map(toSenderConfig),
    rules: rules.map(toRoutingRuleConfig),
    raw: new Map(senders.map((sender) => [sender.id, sender])),
    channelHasNoSenders: channelSenders.length === 0,
    runtime: bundle,
  };
}

function runtimeDefault(snapshot: SenderRoutingSnapshot): ResolvedSender | null {
  const { channel, runtime } = snapshot;
  if (channel === "WHATSAPP") {
    if (!runtime.meta.configured || !runtime.meta.values.defaultPhoneNumberId) return null;
    return { id: null, provider: "META_WHATSAPP", phoneNumberId: runtime.meta.values.defaultPhoneNumberId, senderEmail: null, smsSender: null, displayPhoneNumber: null };
  }
  if (channel === "EMAIL") {
    if (!runtime.elasticEmail.configured || !runtime.elasticEmail.values.senderEmail) return null;
    return { id: null, provider: null, phoneNumberId: null, senderEmail: runtime.elasticEmail.values.senderEmail, smsSender: null, displayPhoneNumber: null };
  }
  /* SMS picks its provider per destination inside the SMS client; there is no single env sender. */
  return { id: null, provider: null, phoneNumberId: null, senderEmail: null, smsSender: null, displayPhoneNumber: null };
}

/**
 * Resolve the sender for ONE recipient against a snapshot.
 *
 * `locale` and `country` are the recipient's, `purpose` the message's — the three inputs the
 * routing rules are written against. Passing them is what makes a campaign and a trigger to the
 * same donor land on the same number.
 */
export function resolveSenderFromSnapshot(
  snapshot: SenderRoutingSnapshot,
  request: { locale?: string | null; country?: string | null; purpose: CommunicationPurposeId },
): SenderResolution {
  /* No sender rows for this channel: nothing has been configured to route BETWEEN, so the
     environment default is the configuration rather than an override of one. */
  if (snapshot.channelHasNoSenders) {
    const fallback = runtimeDefault(snapshot);
    if (!fallback) return { ok: false, reason: "NO_SENDER_AVAILABLE" };
    return { ok: true, sender: fallback, matchedBy: "runtime-default" };
  }

  const routed = resolveSender(
    {
      channel: snapshot.channel as CommunicationChannel,
      locale: request.locale ?? null,
      country: request.country ?? null,
      /* The router compares the purpose as a string against rules and sender capabilities, so the
         full four-value vocabulary passes through intact — UTILITY and AUTHENTICATION are not
         flattened into TRANSACTIONAL, which would make a rule about one match the other. */
      purpose: request.purpose as unknown as CommunicationPurpose,
    },
    snapshot.senders,
    snapshot.rules,
  );

  /* The router looked and declined. That is the answer — see the note at the top of this file. */
  if ("skipped" in routed) return { ok: false, reason: routed.reason };

  const raw = snapshot.raw.get(routed.sender.id);
  return {
    ok: true,
    matchedBy: routed.matchedBy,
    sender: {
      id: routed.sender.id,
      provider: raw?.provider ?? routed.sender.provider ?? null,
      phoneNumberId: raw?.phoneNumberId ?? null,
      senderEmail: raw?.senderEmail ?? null,
      smsSender: raw?.smsSender ?? null,
      displayPhoneNumber: raw?.displayPhoneNumber ?? null,
    },
  };
}

/** The single-send convenience: load a snapshot and resolve one recipient. */
export async function resolveSenderForSend(
  channel: CommunicationChannelId,
  request: { locale?: string | null; country?: string | null; purpose: CommunicationPurposeId },
  runtime?: CommunicationRuntimeBundle,
): Promise<SenderResolution> {
  const snapshot = await loadSenderRoutingSnapshot(channel, runtime);
  return resolveSenderFromSnapshot(snapshot, request);
}
