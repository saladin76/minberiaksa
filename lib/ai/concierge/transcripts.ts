import "server-only";

import { prisma } from "@/lib/prisma";
import type { ConciergeRequest, ConciergeResponse } from "./schema";
import type { ConciergeTurnMeta } from "./engine";

/**
 * Writes each answered concierge turn into `AiConciergeConversation`, one
 * document per session, so the dashboard can show the whole conversation and
 * the insights page can read many of them at once.
 *
 * Best effort, like the funnel events: a failed write is logged and the
 * visitor's reply is unaffected.
 */

const MAX_TURNS = 120;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

type TurnRow = {
  role: string;
  kind: string;
  text: string;
  at: Date;
  intent: string | null;
  mode: string | null;
  blocks: string[];
  campaignIds: string[];
  needsHuman: boolean | null;
};

/** What the visitor did on this turn, as a line of transcript. */
function visitorTurn(req: ConciergeRequest, at: Date): TurnRow | null {
  const base = { role: "user", at, intent: null, mode: null, blocks: [] as string[], campaignIds: [] as string[], needsHuman: null };
  if (req.message) return { ...base, kind: "message", text: req.message };
  const step = req.step;
  if (!step || step.kind === "open") return null;
  const label = req.label?.trim();
  switch (step.kind) {
    case "intent":
      return { ...base, kind: "step", text: label || `intent: ${step.intent}`, intent: step.intent };
    case "select_campaign":
      return { ...base, kind: "step", text: label || "select_campaign", campaignIds: [step.campaignId] };
    case "select_category":
      return { ...base, kind: "step", text: label || "select_category" };
    case "show_more":
      return { ...base, kind: "step", text: label || "show_more" };
    case "added":
      return {
        ...base,
        kind: "added",
        text: `+ $${step.amountUSD} · ${step.frequency}${step.waqf ? " · waqf" : ""}${step.gift ? " · gift" : ""}`,
        campaignIds: step.campaignId ? [step.campaignId] : [],
      };
  }
}

function assistantTurn(res: ConciergeResponse, meta: ConciergeTurnMeta, at: Date): TurnRow {
  const campaignIds = new Set<string>();
  for (const b of res.blocks) {
    if (b.type === "campaign_recommendations") for (const c of b.campaigns) campaignIds.add(c.id);
    if ((b.type === "donation_configuration" || b.type === "suggestion") && b.campaign) campaignIds.add(b.campaign.id);
    if (b.type === "cross_sell") campaignIds.add(b.campaign.id);
  }
  return {
    role: "assistant",
    kind: "message",
    text: res.message.slice(0, 2000),
    at,
    intent: res.intent,
    mode: res.mode,
    blocks: res.blocks.map((b) => b.type),
    campaignIds: [...campaignIds].filter((id) => OBJECT_ID.test(id)),
    needsHuman: meta.needsHuman || meta.needsRuling || res.intent === "support" ? true : null,
  };
}

export async function recordConciergeTurn(input: {
  req: ConciergeRequest;
  res: ConciergeResponse;
  meta: ConciergeTurnMeta;
  userId: string | null;
}): Promise<void> {
  const { req, res, meta } = input;
  try {
    const now = new Date();
    const visitor = visitorTurn(req, now);
    const reply = assistantTurn(res, meta, new Date(now.getTime() + 1));
    const newTurns = visitor ? [visitor, reply] : [reply];
    const intents = new Set<string>();
    for (const t of newTurns) if (t.intent && t.intent !== "unknown") intents.add(t.intent);
    const campaigns = new Set<string>(newTurns.flatMap((t) => t.campaignIds));
    const userId = input.userId && OBJECT_ID.test(input.userId) ? input.userId : null;
    const flagged = reply.needsHuman === true;
    const fallback = Boolean(req.message) && res.mode === "deterministic";

    const existing = await prisma.aiConciergeConversation.findUnique({
      where: { sessionId: req.sessionId },
      select: { id: true, turnCount: true, intents: true, campaignIds: true, userId: true },
    });

    if (!existing) {
      await prisma.aiConciergeConversation.create({
        data: {
          sessionId: req.sessionId,
          locale: req.locale,
          userId,
          firstRoute: req.page?.route ?? null,
          firstPath: req.page?.pathname ?? null,
          turns: newTurns,
          turnCount: newTurns.length,
          userMessageCount: req.message ? 1 : 0,
          intents: [...intents],
          campaignIds: [...campaigns],
          needsHuman: flagged,
          fallbackCount: fallback ? 1 : 0,
          startedAt: now,
          lastMessageAt: now,
        },
      });
      return;
    }

    if (existing.turnCount >= MAX_TURNS) return;
    const mergedIntents = [...new Set([...existing.intents, ...intents])];
    const mergedCampaigns = [...new Set([...existing.campaignIds, ...campaigns])].slice(0, 100);
    await prisma.aiConciergeConversation.update({
      where: { id: existing.id },
      data: {
        turns: { push: newTurns },
        turnCount: { increment: newTurns.length },
        ...(req.message ? { userMessageCount: { increment: 1 } } : {}),
        intents: mergedIntents,
        campaignIds: mergedCampaigns,
        ...(flagged ? { needsHuman: true } : {}),
        ...(fallback ? { fallbackCount: { increment: 1 } } : {}),
        /* A visitor who signs in mid-conversation is linked from then on. */
        ...(userId && !existing.userId ? { userId } : {}),
        locale: req.locale,
        lastMessageAt: now,
      },
    });
  } catch (error) {
    console.error("[concierge] transcript write failed", error instanceof Error ? error.message : error);
  }
}
