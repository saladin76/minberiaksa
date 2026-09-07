export type MarketingResultStatus = "WINNER" | "WATCH" | "LOSING" | "LEARNING";

export type MarketingResultChannel = "META" | "GOOGLE" | "TIKTOK" | "WHATSAPP" | "EMAIL" | "ORGANIC";

export type MarketingResultItem = {
  id: string;
  archiveAssetId: string;
  assetTitle: string;
  channel: MarketingResultChannel;
  campaignTitle: string;
  spend: number;
  revenue: number;
  donations: number;
  clicks: number;
  roas: number;
  status: MarketingResultStatus;
  decision: string;
  learning: string;
};

export type MarketingResultsOverview = {
  source: string;
  generatedAt: string;
  summary: {
    totalResults: number;
    totalSpend: number;
    totalRevenue: number;
    totalDonations: number;
    averageRoas: number;
    winners: number;
    losing: number;
  };
  results: MarketingResultItem[];
};
