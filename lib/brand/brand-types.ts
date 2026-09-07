export type BrandOrganizationKey = "gozbebekleri" | "minber_aksa" | "burak";

export type BrandLocale = "ar" | "tr" | "en" | "fr" | "id" | "pt" | "es" | "de";

export type BrandProfileStatus = "ACTIVE" | "FOUNDATION" | "TO_VERIFY";
export type BrandAssetType =
  | "LOGO"
  | "ICON"
  | "TEMPLATE"
  | "CERTIFICATE"
  | "WATERMARK"
  | "VIDEO_INTRO"
  | "VIDEO_OUTRO"
  | "BRAND_GUIDE";
export type BrandAssetFormat = "SVG" | "PNG" | "JPG" | "PDF" | "FIGMA" | "VIDEO" | "DOC" | "URL";
export type BrandColorUsage = "PRIMARY" | "CTA" | "BACKGROUND" | "ACCENT" | "TEXT" | "STATUS";
export type BrandGuidelineSection = "voice" | "copy" | "proof" | "donor-dignity" | "cta" | "localization";
export type BrandMessageFrameworkType =
  | "FRIDAY"
  | "THANK_YOU"
  | "ZAKAT"
  | "WAQF"
  | "EMERGENCY"
  | "DONOR_REACTIVATION"
  | "RAMADAN"
  | "GENERAL";

export type BrandProfile = {
  id: string;
  key: BrandOrganizationKey;
  name: string;
  description: string;
  mission: string;
  vision: string;
  contentVoice: string;
  messagePhilosophy: string;
  primaryLocale: BrandLocale;
  supportedLocales: BrandLocale[];
  website: string;
  isActive: boolean;
  status: BrandProfileStatus;
  verificationNote: string;
};

export type BrandAsset = {
  id: string;
  profileId: string;
  title: string;
  type: BrandAssetType;
  format: BrandAssetFormat;
  fileUrl: string | null;
  previewUrl: string | null;
  usage: string;
  locale: BrandLocale | "all";
  notes: string;
  downloadable: boolean;
  createdBy: string;
  status: BrandProfileStatus;
};

export type BrandColor = {
  id: string;
  profileId: string;
  name: string;
  hex: string;
  rgb: string;
  usage: BrandColorUsage;
  description: string;
  order: number;
};

export type BrandFont = {
  id: string;
  profileId: string;
  name: string;
  usage: string;
  fallback: string;
  source: string;
  notes: string;
};

export type BrandGuideline = {
  id: string;
  profileId: string;
  section: BrandGuidelineSection;
  title: string;
  body: string;
  examples: string[];
  order: number;
};

export type BrandMessageFramework = {
  id: string;
  profileId: string;
  name: string;
  type: BrandMessageFrameworkType;
  locale: BrandLocale;
  structure: string[];
  sampleText: string;
  doList: string[];
  dontList: string[];
};

export type BrandCenterTabKey =
  | "overview"
  | "organizations"
  | "assets"
  | "colors"
  | "typography"
  | "voice"
  | "frameworks"
  | "downloads";

export type BrandCenterTab = {
  key: BrandCenterTabKey;
  title: string;
  href: string;
};

export type BrandReadinessAlert = {
  id: string;
  severity: "info" | "warning" | "success";
  title: string;
  detail: string;
};

export type BrandDownloadItem = {
  id: string;
  title: string;
  type: BrandAssetType | "PROFILE";
  url: string | null;
  note: string;
  ready: boolean;
};

export type BrandCenterPersistenceMode = "foundation" | "foundation-fallback" | "db-backed";

export type BrandCenterSnapshot = {
  source: "brand-center-foundation" | "brand-center-db-backed";
  persistence: {
    mode: BrandCenterPersistenceMode;
    nextModels: string[];
    activeModels?: string[];
    reason?: string;
    dbCounts?: {
      profiles: number;
      assets: number;
      colors: number;
      fonts: number;
      guidelines: number;
      messageFrameworks: number;
    };
  };
  generatedAt: string;
  activeProfile: BrandProfile;
  profiles: BrandProfile[];
  assets: BrandAsset[];
  colors: BrandColor[];
  fonts: BrandFont[];
  guidelines: BrandGuideline[];
  messageFrameworks: BrandMessageFramework[];
  downloads: BrandDownloadItem[];
  alerts: BrandReadinessAlert[];
  tabs: BrandCenterTab[];
  summary: {
    profiles: number;
    activeProfileName: string;
    assets: number;
    downloadableAssets: number;
    colors: number;
    guidelines: number;
    frameworks: number;
    toVerify: number;
  };
  qa: {
    brandAssetSeparatedFromArchiveAsset: boolean;
    aiOutputsAreDraftOnly: boolean;
    noAutoPublish: boolean;
    noFrontendSecrets: boolean;
  };
};

export type BrandAiSourcePack = {
  profile: BrandProfile;
  colors: BrandColor[];
  guidelines: BrandGuideline[];
  frameworks: BrandMessageFramework[];
};

export type BrandCenterOverview = BrandCenterSnapshot;
