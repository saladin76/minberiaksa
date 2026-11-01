import type { SearchProposal } from "./contracts";
export const searchCampaignKey = (campaign: { locale: string; country?: string }) => campaign.country ? `${campaign.locale}-${campaign.country}` : campaign.locale;
export type SearchResources = { campaigns: string[]; campaignKeys?: Record<string, string>; mutationResults?: unknown[] };
export function proposalCampaignForResource(proposal: SearchProposal, resources: unknown, resource: string, providerName?: string) {
  const saved = resources as SearchResources | null;
  const storedKey = saved?.campaignKeys?.[resource];
  if (storedKey) return proposal.campaigns.find(campaign => searchCampaignKey(campaign) === storedKey);
  if (saved?.campaigns.length === proposal.campaigns.length) return proposal.campaigns[saved.campaigns.indexOf(resource)];
  // Legacy creation/reconciliation had no explicit assignment map.
  const legacyKey = providerName?.split(" | ")[1];
  return proposal.campaigns.find(campaign => searchCampaignKey(campaign) === legacyKey);
}
