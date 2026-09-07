export type GoogleAdsDeepArea = {
  key: string;
  title: string;
  description: string;
  whyItMatters: string;
  gaql: string;
  outputs: string[];
};

export const GOOGLE_ADS_DEEP_AREAS: GoogleAdsDeepArea[] = [
  {
    key: "keywords",
    title: "Keywords Performance",
    description: "سحب أداء الكلمات داخل Search campaigns حسب التكلفة والنقرات والتحويلات.",
    whyItMatters: "يساعدنا نعرف الكلمات التي تصرف بدون تبرعات والكلمات التي تستحق زيادة الميزانية.",
    gaql: `SELECT
  campaign.id,
  campaign.name,
  ad_group.id,
  ad_group.name,
  ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type,
  metrics.cost_micros,
  metrics.impressions,
  metrics.clicks,
  metrics.conversions,
  metrics.conversions_value
FROM keyword_view
WHERE segments.date BETWEEN @dateFrom AND @dateTo`,
    outputs: ["keyword", "match type", "cost", "clicks", "conversions", "conversion value", "campaign", "ad group"],
  },
  {
    key: "search_terms",
    title: "Search Terms Intelligence",
    description: "سحب عبارات البحث الفعلية التي كتبها المستخدمون قبل الضغط على الإعلان.",
    whyItMatters: "هذه أهم نقطة لعلاج التشتيت في Google؛ منها نخرج negative keywords ونكتشف نوايا التبرع الحقيقية.",
    gaql: `SELECT
  campaign.id,
  campaign.name,
  ad_group.id,
  ad_group.name,
  search_term_view.search_term,
  search_term_view.status,
  metrics.cost_micros,
  metrics.impressions,
  metrics.clicks,
  metrics.conversions,
  metrics.conversions_value
FROM search_term_view
WHERE segments.date BETWEEN @dateFrom AND @dateTo`,
    outputs: ["search term", "status", "cost", "clicks", "conversions", "negative keyword candidates", "intent quality"],
  },
  {
    key: "responsive_search_ads",
    title: "Responsive Search Ads Copy",
    description: "سحب عناوين وأوصاف إعلانات البحث وتحليل الرسائل التي تجلب نتائج أو تشتت المستخدم.",
    whyItMatters: "يساعدنا نعرف العناوين القوية، العناوين العامة جدًا، والرسائل التي تحتاج تعديل.",
    gaql: `SELECT
  campaign.id,
  campaign.name,
  ad_group.id,
  ad_group.name,
  ad_group_ad.ad.id,
  ad_group_ad.ad.responsive_search_ad.headlines,
  ad_group_ad.ad.responsive_search_ad.descriptions,
  ad_group_ad.status,
  metrics.impressions,
  metrics.clicks,
  metrics.conversions,
  metrics.conversions_value
FROM ad_group_ad
WHERE ad_group_ad.ad.type = RESPONSIVE_SEARCH_AD
  AND segments.date BETWEEN @dateFrom AND @dateTo`,
    outputs: ["headlines", "descriptions", "ad status", "clicks", "conversions", "copy recommendations"],
  },
  {
    key: "assets",
    title: "Assets & Asset Performance",
    description: "سحب أصول Google Ads مثل sitelinks/callouts/images عند توفرها وربطها بالأداء.",
    whyItMatters: "الأصول قد ترفع أو تشتت الأداء، وتحليلها يساعدنا نعرف أي إضافات الإعلان أكثر فاعلية.",
    gaql: `SELECT
  asset.id,
  asset.name,
  asset.type,
  campaign_asset.campaign,
  campaign_asset.field_type,
  metrics.impressions,
  metrics.clicks,
  metrics.conversions
FROM campaign_asset
WHERE segments.date BETWEEN @dateFrom AND @dateTo`,
    outputs: ["asset id", "asset type", "field type", "impressions", "clicks", "conversions"],
  },
  {
    key: "final_urls",
    title: "Final URLs & Tracking Templates",
    description: "سحب روابط الهبوط النهائية وTracking templates للتأكد من UTM وValueTrack.",
    whyItMatters: "لو الروابط ناقصة أو غير موحدة، التحليل والتبرعات لن تنسب للحملات بشكل صحيح.",
    gaql: `SELECT
  campaign.id,
  campaign.name,
  ad_group_ad.ad.id,
  ad_group_ad.ad.final_urls,
  ad_group_ad.ad.tracking_url_template,
  ad_group_ad.ad.final_url_suffix,
  metrics.clicks,
  metrics.conversions
FROM ad_group_ad
WHERE segments.date BETWEEN @dateFrom AND @dateTo`,
    outputs: ["final urls", "tracking template", "final url suffix", "utm checks", "ValueTrack checks"],
  },
];

export const GOOGLE_ADS_REQUIRED_FIELDS = [
  "Customer ID",
  "Developer Token",
  "OAuth Client ID",
  "OAuth Client Secret",
  "Refresh Token",
  "Manager Customer ID إذا الحساب تحت MCC",
];
