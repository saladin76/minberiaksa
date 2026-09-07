export type ProviderCategory =
  | "PIXELS_AND_APIS"
  | "AD_ACCOUNT"
  | "ANALYTICS_ACCOUNT"
  | "MESSAGING_PROVIDER"
  | "EMAIL_PROVIDER"
  | "AI_PROVIDER"
  | "ARCHIVE_STORAGE_PROVIDER"
  | "INTERNAL_API";

export type ProviderCapability =
  | "BROWSER_PIXEL"
  | "SERVER_CONVERSIONS"
  | "REPORTING_SYNC"
  | "CAMPAIGN_SYNC"
  | "MESSAGE_DELIVERY"
  | "MESSAGE_STATUS"
  | "EMAIL_DELIVERY"
  | "AI_COMPLETION"
  | "AI_ANALYSIS"
  | "DRIVE_FILE_ACCESS"
  | "DRIVE_FILE_PICKER"
  | "ASSET_STORAGE"
  | "VIDEO_FRAME_EXTRACTION"
  | "FILE_UPLOAD"
  | "FILE_DOWNLOAD"
  | "WEBHOOKS"
  | "INTERNAL_EVENTS";

export type ProviderEnvironment = "SERVER" | "BROWSER" | "BOTH";

export type ProviderReadinessLayer =
  | "BROWSER"
  | "SERVER"
  | "REPORTING"
  | "OAUTH"
  | "STORAGE"
  | "AI_CORE"
  | "ARCHIVE";

export type ProviderImplementationStatus = "PLANNED" | "PARTIAL" | "READY";

export type ProviderKey =
  | "meta"
  | "google_ads"
  | "ga4"
  | "tiktok"
  | "x_ads"
  | "twilio"
  | "netgsm"
  | "openai"
  | "google_drive"
  | "google_picker"
  | "video_frame_extractor"
  | "storage_provider"
  | "email"
  | "whatsapp"
  | "internal_webhooks";

export type ProviderDocLink = {
  label: string;
  url: string;
};

export type ProviderCredentialField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  environment: ProviderEnvironment;
};

export type ProviderCatalogEntry = {
  key: ProviderKey;
  displayName: string;
  category: ProviderCategory;
  capabilities: ProviderCapability[];
  officialDocs: ProviderDocLink[];
  credentialFields: ProviderCredentialField[];
  readinessLayers: ProviderReadinessLayer[];
  supportedEnvironments: ProviderEnvironment[];
  notes: string[];
  implementationStatus: ProviderImplementationStatus;
};
