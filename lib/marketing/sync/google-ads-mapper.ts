import type { SyncAdGroupSnapshot, SyncAdSnapshot, SyncCampaignSnapshot } from "./types";

type GaqlRow = Record<string, any>;

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dayStart(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function moneyFromMicros(value: unknown) {
  return asNumber(value) / 1000000;
}

function textId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function adName(row: GaqlRow, adId: string) {
  return asString(row.adGroupAd?.ad?.name) || asString(row.ad_group_ad?.ad?.name) || `Google Ad ${adId}`;
}

export function mapGoogleAdsRows(rows: GaqlRow[], defaultCurrency?: string | null) {
  const campaigns = new Map<string, SyncCampaignSnapshot>();
  const adGroups = new Map<string, SyncAdGroupSnapshot>();
  const ads: SyncAdSnapshot[] = [];

  for (const row of rows) {
    const date = asString(row.segments?.date) || asString(row.segments?.date?.value);
    const campaignId = textId(row.campaign?.id);
    const adGroupId = textId(row.adGroup?.id ?? row.ad_group?.id);
    const adId = textId(row.adGroupAd?.ad?.id ?? row.ad_group_ad?.ad?.id);
    if (!date || !campaignId || !adGroupId || !adId) continue;

    const spend = moneyFromMicros(row.metrics?.costMicros ?? row.metrics?.cost_micros);
    const impressions = Math.round(asNumber(row.metrics?.impressions));
    const clicks = Math.round(asNumber(row.metrics?.clicks));
    const conversions = asNumber(row.metrics?.conversions);
    const conversionValue = asNumber(row.metrics?.conversionsValue ?? row.metrics?.conversions_value);
    const currency = asString(row.customer?.currencyCode ?? row.customer?.currency_code) || defaultCurrency || null;
    const campaignName = asString(row.campaign?.name);
    const adGroupName = asString(row.adGroup?.name ?? row.ad_group?.name);
    const campaignKey = `${date}:${campaignId}`;
    const adGroupKey = `${date}:${adGroupId}`;

    const campaign = campaigns.get(campaignKey) || {
      date: dayStart(date),
      campaignId,
      campaignName,
      status: asString(row.campaign?.status),
      objective: asString(row.campaign?.advertisingChannelType ?? row.campaign?.advertising_channel_type),
      spend: 0,
      impressions: 0,
      clicks: 0,
      ctr: null,
      cpc: null,
      cpm: null,
      reportedConversions: 0,
      reportedConversionValue: 0,
      currency,
      raw: { source: "google_ads_campaign_rollup" },
    } satisfies SyncCampaignSnapshot;
    campaign.spend = (campaign.spend || 0) + spend;
    campaign.impressions = (campaign.impressions || 0) + impressions;
    campaign.clicks = (campaign.clicks || 0) + clicks;
    campaign.reportedConversions = (campaign.reportedConversions || 0) + conversions;
    campaign.reportedConversionValue = (campaign.reportedConversionValue || 0) + conversionValue;
    campaigns.set(campaignKey, campaign);

    const adGroup = adGroups.get(adGroupKey) || {
      date: dayStart(date),
      campaignId,
      campaignName,
      adGroupId,
      adGroupName,
      spend: 0,
      impressions: 0,
      clicks: 0,
      reportedConversions: 0,
      reportedConversionValue: 0,
      currency,
      raw: { source: "google_ads_ad_group_rollup" },
    } satisfies SyncAdGroupSnapshot;
    adGroup.spend = (adGroup.spend || 0) + spend;
    adGroup.impressions = (adGroup.impressions || 0) + impressions;
    adGroup.clicks = (adGroup.clicks || 0) + clicks;
    adGroup.reportedConversions = (adGroup.reportedConversions || 0) + conversions;
    adGroup.reportedConversionValue = (adGroup.reportedConversionValue || 0) + conversionValue;
    adGroups.set(adGroupKey, adGroup);

    ads.push({
      date: dayStart(date),
      campaignId,
      campaignName,
      adGroupId,
      adGroupName,
      adId,
      adName: adName(row, adId),
      spend,
      impressions,
      clicks,
      reportedConversions: conversions,
      reportedConversionValue: conversionValue,
      currency,
      raw: row,
    });
  }

  return { campaigns: [...campaigns.values()], adGroups: [...adGroups.values()], ads };
}
