import { getWorkRegistrySnapshot } from "@/lib/operations/content-registry/work-service";
import type { WorkItem } from "@/lib/operations/content-registry/registry-types";
import { listCampaignLinks, type CampaignLinkRecord } from "./campaign-link-registry-service";

export type WorkLinkCandidate = {
  workId: string;
  workCode: string;
  workTitle: string;
  linkId: string;
  linkName: string;
  platform: string | null;
  score: number;
  reasons: string[];
};

export type WorkLinkBridgeSummary = {
  candidates: number;
  linkedWorkItems: number;
  linkedLinks: number;
  strongCandidates: number;
};

function text(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function tokens(value: string) {
  return text(value).split(/[^\p{L}\p{N}]+/u).filter((item) => item.length >= 3);
}

function scorePair(work: WorkItem, link: CampaignLinkRecord) {
  let score = 0;
  const reasons: string[] = [];
  const pool = [link.name, link.utmCampaign, link.utmContent, link.campaignId, link.adId, link.internalNotes, link.url].map(text).join(" ");

  if (work.code && pool.includes(text(work.code))) {
    score += 8;
    reasons.push("work_code");
  }

  const titleTokens = tokens(work.title);
  const hits = titleTokens.filter((token) => pool.includes(token));
  if (hits.length > 0) {
    score += Math.min(5, hits.length);
    reasons.push("title_terms");
  }

  if (work.theme && pool.includes(text(work.theme))) {
    score += 2;
    reasons.push("theme");
  }

  if (work.format && pool.includes(text(work.format))) {
    score += 1;
    reasons.push("format");
  }

  return { score, reasons };
}

function summarize(candidates: WorkLinkCandidate[]): WorkLinkBridgeSummary {
  return {
    candidates: candidates.length,
    linkedWorkItems: new Set(candidates.map((item) => item.workId)).size,
    linkedLinks: new Set(candidates.map((item) => item.linkId)).size,
    strongCandidates: candidates.filter((item) => item.score >= 8).length,
  };
}

export async function getWorkLinkCandidates(limit = 100): Promise<WorkLinkCandidate[]> {
  const [work, links] = await Promise.all([
    getWorkRegistrySnapshot(),
    listCampaignLinks({ limit, status: "ALL" }),
  ]);

  return work.items.flatMap((item) => links.map((link) => {
    const match = scorePair(item, link);
    return {
      workId: item.id,
      workCode: item.code,
      workTitle: item.title,
      linkId: link.id,
      linkName: link.name,
      platform: link.platform || null,
      score: match.score,
      reasons: match.reasons,
    };
  })).filter((item) => item.score >= 3).sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function getWorkLinkBridge(limit = 100) {
  const candidates = await getWorkLinkCandidates(limit);
  return { summary: summarize(candidates), candidates };
}
