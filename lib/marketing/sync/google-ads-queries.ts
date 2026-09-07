export function googleAdsAdPerformanceQuery(dateFrom: Date, dateTo: Date) {
  const from = dateFrom.toISOString().slice(0, 10);
  const to = dateTo.toISOString().slice(0, 10);
  return `
    SELECT
      segments.date,
      customer.currency_code,
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      ad_group.id,
      ad_group.name,
      ad_group.status,
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.status,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm,
      metrics.conversions,
      metrics.conversions_value
    FROM ad_group_ad
    WHERE segments.date BETWEEN '${from}' AND '${to}'
  `;
}
