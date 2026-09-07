import type { ProviderCatalogEntry, ProviderCategory, ProviderKey } from "./provider-types";

// Central provider catalog for Marketing, Content Scheduling, AI, and Archive.
// Keep this file as metadata only: no secrets, no OAuth logic, and no API clients here.
export const integrationProviderCatalog: ProviderCatalogEntry[] = [
  {
    key: "meta",
    displayName: "Meta",
    category: "PIXELS_AND_APIS",
    capabilities: ["BROWSER_PIXEL", "SERVER_CONVERSIONS", "REPORTING_SYNC", "CAMPAIGN_SYNC"],
    readinessLayers: ["BROWSER", "SERVER", "REPORTING"],
    supportedEnvironments: ["BOTH"],
    officialDocs: [
      { label: "Meta Pixel", url: "https://developers.facebook.com/docs/meta-pixel/" },
      { label: "Conversions API", url: "https://developers.facebook.com/docs/marketing-api/conversions-api/" },
      { label: "Marketing API Insights", url: "https://developers.facebook.com/docs/marketing-api/insights/" },
    ],
    credentialFields: [
      { key: "pixelId", label: "Pixel ID", secret: false, required: true, environment: "BROWSER" },
      { key: "accessToken", label: "Conversions API Access Token", secret: true, required: true, environment: "SERVER" },
      { key: "adAccountId", label: "Ad Account ID", secret: false, required: false, environment: "SERVER" },
    ],
    notes: [
      "Use Meta for pixel events, server conversions, and campaign/adset/ad insights.",
      "Do not mark browser events as SENT until fbq fires successfully.",
    ],
    implementationStatus: "PARTIAL",
  },
  {
    key: "google_ads",
    displayName: "Google Ads",
    category: "AD_ACCOUNT",
    capabilities: ["REPORTING_SYNC", "CAMPAIGN_SYNC", "SERVER_CONVERSIONS"],
    readinessLayers: ["SERVER", "REPORTING"],
    supportedEnvironments: ["SERVER"],
    officialDocs: [
      { label: "Google Ads API", url: "https://developers.google.com/google-ads/api/docs/start" },
      { label: "Google Ads Query Language", url: "https://developers.google.com/google-ads/api/docs/query/overview" },
      { label: "Conversion uploads", url: "https://developers.google.com/google-ads/api/docs/conversions/overview" },
    ],
    credentialFields: [
      { key: "customerId", label: "Customer ID", secret: false, required: true, environment: "SERVER" },
      { key: "managerCustomerId", label: "Manager Customer ID", secret: false, required: false, environment: "SERVER" },
      { key: "developerToken", label: "Developer Token", secret: true, required: true, environment: "SERVER" },
      { key: "refreshToken", label: "OAuth Refresh Token", secret: true, required: true, environment: "SERVER" },
    ],
    notes: [
      "Use GAQL for campaign, ad group, ad, spend, click, and conversion reporting before building sync clients.",
      "Google Ads reporting is not the financial source of truth; paid donations remain the source of revenue truth.",
    ],
    implementationStatus: "PLANNED",
  },
  {
    key: "ga4",
    displayName: "Google Analytics 4",
    category: "ANALYTICS_ACCOUNT",
    capabilities: ["REPORTING_SYNC", "SERVER_CONVERSIONS"],
    readinessLayers: ["SERVER", "REPORTING"],
    supportedEnvironments: ["SERVER"],
    officialDocs: [
      { label: "GA4 Data API", url: "https://developers.google.com/analytics/devguides/reporting/data/v1" },
      { label: "Measurement Protocol", url: "https://developers.google.com/analytics/devguides/collection/protocol/ga4" },
    ],
    credentialFields: [
      { key: "measurementId", label: "Measurement ID", secret: false, required: true, environment: "BROWSER" },
      { key: "propertyId", label: "GA4 Property ID", secret: false, required: false, environment: "SERVER" },
      { key: "apiSecret", label: "Measurement Protocol API Secret", secret: true, required: false, environment: "SERVER" },
    ],
    notes: [
      "Use GA4 as journey analytics, not as the financial source of truth.",
      "GA4 Data API can support source, medium, campaign, device, country, and event journey reporting.",
    ],
    implementationStatus: "PLANNED",
  },
  {
    key: "tiktok",
    displayName: "TikTok",
    category: "PIXELS_AND_APIS",
    capabilities: ["BROWSER_PIXEL", "SERVER_CONVERSIONS", "REPORTING_SYNC", "CAMPAIGN_SYNC"],
    readinessLayers: ["BROWSER", "SERVER", "REPORTING"],
    supportedEnvironments: ["BOTH"],
    officialDocs: [
      { label: "TikTok Events API", url: "https://business-api.tiktok.com/portal/docs?id=1739584855420929" },
      { label: "TikTok Reporting API", url: "https://business-api.tiktok.com/portal/docs?id=1738864915188737" },
    ],
    credentialFields: [
      { key: "pixelId", label: "Pixel ID", secret: false, required: true, environment: "BROWSER" },
      { key: "accessToken", label: "Access Token", secret: true, required: true, environment: "SERVER" },
      { key: "advertiserId", label: "Advertiser ID", secret: false, required: false, environment: "SERVER" },
    ],
    notes: [
      "Use TikTok Events API for CompletePayment and Reports API for campaign/adgroup/ad performance.",
      "Keep TikTok click IDs and event IDs available for deduplication and reconciliation.",
    ],
    implementationStatus: "PLANNED",
  },
  {
    key: "x_ads",
    displayName: "X Ads",
    category: "AD_ACCOUNT",
    capabilities: ["BROWSER_PIXEL", "REPORTING_SYNC", "CAMPAIGN_SYNC"],
    readinessLayers: ["BROWSER", "REPORTING"],
    supportedEnvironments: ["BOTH"],
    officialDocs: [
      { label: "X Ads API", url: "https://developer.x.com/en/docs/x-ads-api" },
      { label: "X Pixel", url: "https://business.x.com/en/help/campaign-measurement-and-analytics/conversion-tracking-for-websites.html" },
    ],
    credentialFields: [
      { key: "pixelId", label: "Pixel ID", secret: false, required: false, environment: "BROWSER" },
      { key: "accountId", label: "Ads Account ID", secret: false, required: false, environment: "SERVER" },
      { key: "accessToken", label: "Access Token", secret: true, required: false, environment: "SERVER" },
    ],
    notes: [
      "Start with browser tracking and reporting only.",
      "Server conversion support depends on account/API access and must be documented before implementation.",
    ],
    implementationStatus: "PLANNED",
  },
  {
    key: "twilio",
    displayName: "Twilio",
    category: "MESSAGING_PROVIDER",
    capabilities: ["MESSAGE_DELIVERY", "MESSAGE_STATUS", "WEBHOOKS"],
    readinessLayers: ["SERVER", "REPORTING"],
    supportedEnvironments: ["SERVER"],
    officialDocs: [
      { label: "Twilio Messaging", url: "https://www.twilio.com/docs/messaging" },
      { label: "Twilio Status Callbacks", url: "https://www.twilio.com/docs/messaging/guides/outbound-message-status-in-status-callbacks" },
    ],
    credentialFields: [
      { key: "accountSid", label: "Account SID", secret: false, required: true, environment: "SERVER" },
      { key: "authToken", label: "Auth Token", secret: true, required: true, environment: "SERVER" },
      { key: "messagingServiceSid", label: "Messaging Service SID", secret: false, required: false, environment: "SERVER" },
    ],
    notes: [
      "Use Twilio for international SMS or WhatsApp flows where enabled.",
      "Turkey SMS should route to Netgsm instead of Twilio unless explicitly overridden.",
    ],
    implementationStatus: "PARTIAL",
  },
  {
    key: "netgsm",
    displayName: "Netgsm",
    category: "MESSAGING_PROVIDER",
    capabilities: ["MESSAGE_DELIVERY", "MESSAGE_STATUS", "WEBHOOKS"],
    readinessLayers: ["SERVER", "REPORTING"],
    supportedEnvironments: ["SERVER"],
    officialDocs: [
      { label: "Netgsm Developer Docs", url: "https://www.netgsm.com.tr/dokuman" },
    ],
    credentialFields: [
      { key: "username", label: "Username", secret: false, required: true, environment: "SERVER" },
      { key: "password", label: "Password", secret: true, required: true, environment: "SERVER" },
      { key: "header", label: "SMS Header", secret: false, required: true, environment: "SERVER" },
    ],
    notes: [
      "Primary SMS provider for Turkey.",
      "Keep routing rules separate from Twilio international SMS.",
    ],
    implementationStatus: "PLANNED",
  },
  {
    key: "openai",
    displayName: "OpenAI",
    category: "AI_PROVIDER",
    capabilities: ["AI_COMPLETION", "AI_ANALYSIS"],
    readinessLayers: ["SERVER", "AI_CORE"],
    supportedEnvironments: ["SERVER"],
    officialDocs: [
      { label: "OpenAI API reference", url: "https://platform.openai.com/docs/api-reference" },
      { label: "OpenAI platform docs", url: "https://platform.openai.com/docs" },
    ],
    credentialFields: [
      { key: "apiKey", label: "API Key", secret: true, required: true, environment: "SERVER" },
    ],
    notes: [
      "One shared AI core should serve separate assistant contexts for marketing, content, archive, and brand.",
      "Do not connect individual dashboard pages directly to an AI provider client.",
      "AI output must remain review-only until a human approves sending, publishing, budget, or tracking changes.",
    ],
    implementationStatus: "PLANNED",
  },
  {
    key: "google_drive",
    displayName: "Google Drive",
    category: "ARCHIVE_STORAGE_PROVIDER",
    capabilities: ["DRIVE_FILE_ACCESS", "FILE_UPLOAD", "FILE_DOWNLOAD", "ASSET_STORAGE"],
    readinessLayers: ["OAUTH", "SERVER", "STORAGE", "ARCHIVE"],
    supportedEnvironments: ["SERVER"],
    officialDocs: [
      { label: "Google Drive API overview", url: "https://developers.google.com/workspace/drive/api/guides/about-sdk" },
      { label: "Google Drive API scopes", url: "https://developers.google.com/workspace/drive/api/guides/api-specific-auth" },
    ],
    credentialFields: [
      { key: "projectId", label: "Google Cloud Project ID", secret: false, required: true, environment: "SERVER" },
      { key: "oauthClientId", label: "OAuth Client ID", secret: false, required: true, environment: "SERVER" },
      { key: "oauthClientSecret", label: "OAuth Client Secret", secret: true, required: true, environment: "SERVER" },
      { key: "refreshToken", label: "OAuth Refresh Token", secret: true, required: true, environment: "SERVER" },
      { key: "rootFolderId", label: "Root Folder ID", secret: false, required: false, environment: "SERVER" },
    ],
    notes: [
      "Contract only for future archive access; do not run Google Drive sync from this catalog entry.",
      "Enable Google Drive API in Google Cloud Console before OAuth.",
      "Prefer drive.file with Google Picker for selected files. drive.readonly is broader and needs explicit review.",
    ],
    implementationStatus: "PLANNED",
  },
  {
    key: "google_picker",
    displayName: "Google Picker",
    category: "ARCHIVE_STORAGE_PROVIDER",
    capabilities: ["DRIVE_FILE_PICKER", "DRIVE_FILE_ACCESS"],
    readinessLayers: ["BROWSER", "OAUTH", "ARCHIVE"],
    supportedEnvironments: ["BROWSER"],
    officialDocs: [
      { label: "Google Picker overview", url: "https://developers.google.com/workspace/drive/picker/guides/overview" },
      { label: "Google Picker configure", url: "https://developers.google.com/workspace/drive/picker/guides/overview#configure_the_google_picker_api" },
    ],
    credentialFields: [
      { key: "browserApiKey", label: "Browser API key", secret: false, required: true, environment: "BROWSER" },
      { key: "oauthClientId", label: "OAuth Client ID", secret: false, required: true, environment: "BROWSER" },
      { key: "appId", label: "Google Cloud Project number", secret: false, required: false, environment: "BROWSER" },
    ],
    notes: [
      "Picker lets a user choose files intentionally; it is not archive sync.",
      "Restrict browser keys by HTTP referrer and pair Picker with the narrowest useful Drive scope.",
    ],
    implementationStatus: "PLANNED",
  },
  {
    key: "video_frame_extractor",
    displayName: "Video Frame Extractor",
    category: "ARCHIVE_STORAGE_PROVIDER",
    capabilities: ["VIDEO_FRAME_EXTRACTION"],
    readinessLayers: ["SERVER", "ARCHIVE"],
    supportedEnvironments: ["SERVER"],
    officialDocs: [
      { label: "FFmpeg documentation", url: "https://ffmpeg.org/ffmpeg.html" },
    ],
    credentialFields: [
      { key: "runtime", label: "Runtime contract", secret: false, required: true, environment: "SERVER" },
      { key: "queueName", label: "Queue / worker name", secret: false, required: false, environment: "SERVER" },
    ],
    notes: [
      "Contract only for future frame extraction from archive videos.",
      "No worker, processing queue, or media execution is enabled by this metadata.",
    ],
    implementationStatus: "PLANNED",
  },
  {
    key: "storage_provider",
    displayName: "Storage Provider",
    category: "ARCHIVE_STORAGE_PROVIDER",
    capabilities: ["ASSET_STORAGE", "FILE_UPLOAD", "FILE_DOWNLOAD"],
    readinessLayers: ["SERVER", "STORAGE", "ARCHIVE"],
    supportedEnvironments: ["SERVER"],
    officialDocs: [
      { label: "Vercel Blob", url: "https://vercel.com/docs/vercel-blob" },
    ],
    credentialFields: [
      { key: "namespace", label: "Storage namespace / bucket", secret: false, required: true, environment: "SERVER" },
      { key: "writeToken", label: "Storage write token", secret: true, required: true, environment: "SERVER" },
      { key: "providerName", label: "Provider name", secret: false, required: false, environment: "SERVER" },
      { key: "region", label: "Region / project", secret: false, required: false, environment: "SERVER" },
    ],
    notes: [
      "Contract only for archive assets; provider choice can remain Vercel Blob, S3, or another documented provider.",
      "Do not expose storage write tokens in frontend components.",
    ],
    implementationStatus: "PLANNED",
  },
  {
    key: "email",
    displayName: "Email Provider",
    category: "EMAIL_PROVIDER",
    capabilities: ["EMAIL_DELIVERY", "MESSAGE_STATUS", "WEBHOOKS"],
    readinessLayers: ["SERVER", "REPORTING"],
    supportedEnvironments: ["SERVER"],
    officialDocs: [],
    credentialFields: [
      { key: "providerName", label: "Provider Name", secret: false, required: true, environment: "SERVER" },
      { key: "apiKey", label: "API Key", secret: true, required: false, environment: "SERVER" },
    ],
    notes: [
      "Use this generic entry until the final email provider is selected and documented from official sources.",
      "Transactional email and campaign email may require separate provider contracts later.",
    ],
    implementationStatus: "PLANNED",
  },
  {
    key: "whatsapp",
    displayName: "WhatsApp Provider",
    category: "MESSAGING_PROVIDER",
    capabilities: ["MESSAGE_DELIVERY", "MESSAGE_STATUS", "WEBHOOKS"],
    readinessLayers: ["SERVER", "REPORTING"],
    supportedEnvironments: ["SERVER"],
    officialDocs: [
      { label: "WhatsApp Business Platform", url: "https://developers.facebook.com/docs/whatsapp" },
    ],
    credentialFields: [
      { key: "businessAccountId", label: "Business Account ID", secret: false, required: false, environment: "SERVER" },
      { key: "phoneNumberId", label: "Phone Number ID", secret: false, required: false, environment: "SERVER" },
      { key: "accessToken", label: "Access Token", secret: true, required: false, environment: "SERVER" },
    ],
    notes: [
      "Represent WhatsApp separately from SMS because templates, approvals, and delivery states differ.",
      "WhatsApp may be served through Meta directly or a messaging provider depending on final routing.",
    ],
    implementationStatus: "PLANNED",
  },
  {
    key: "internal_webhooks",
    displayName: "Internal Webhooks",
    category: "INTERNAL_API",
    capabilities: ["WEBHOOKS", "INTERNAL_EVENTS"],
    readinessLayers: ["SERVER"],
    supportedEnvironments: ["SERVER"],
    officialDocs: [],
    credentialFields: [
      { key: "sharedSecret", label: "Shared Secret", secret: true, required: false, environment: "SERVER" },
    ],
    notes: [
      "Use for internal automation, scheduler events, and cross-system handoff events.",
      "Internal APIs still need contracts, event names, and replay/idempotency rules.",
    ],
    implementationStatus: "PLANNED",
  },
];

export function getProvidersByCategory(category: ProviderCategory) {
  return integrationProviderCatalog.filter((provider) => provider.category === category);
}

export function getProviderByKey(key: ProviderKey) {
  return integrationProviderCatalog.find((provider) => provider.key === key);
}
