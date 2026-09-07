export type MarketingPlatform = "META" | "GOOGLE" | "TIKTOK" | "X";
export type MarketingPerformanceStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED";

export type MarketingPerformanceRecord = {
  id: string;
  title: string;
  contentItemId?: string | null;
  platform: MarketingPlatform;
  campaignName: string;
  period: string;
  spend: number;
  donations: number;
  donationValue: number;
  clicks: number;
  impressions: number;
  conversions: number;
  status: MarketingPerformanceStatus;
  owner?: string | null;
  notes?: string | null;
};

export type MarketingPerformanceOverview = {
  generatedAt: string;
  records: MarketingPerformanceRecord[];
  summary: {
    records: number;
    spend: number;
    donations: number;
    donationValue: number;
    clicks: number;
    impressions: number;
    conversions: number;
    averageCpa: number;
    roas: number;
  };
  safety: {
    externalSideEffects: false;
    autoBudgetChange: false;
    humanReviewRequired: true;
    note: string;
  };
};
