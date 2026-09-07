export type WorkFormat = "VIDEO" | "DESIGN" | "CAROUSEL" | "STORY" | "EMAIL" | "MESSAGE" | "PAGE_COPY";
export type WorkTheme = "AL_QUDS" | "GAZA" | "WAQF" | "ZAKAT" | "RAMADAN" | "FRIDAY" | "GENERAL";
export type WorkLanguage = "ar" | "tr" | "en" | "de" | "fr" | "es" | "nl" | "sv" | "ur" | "id" | "pt";
export type WorkStatus = "IDEA" | "COPY" | "ASSET" | "REVIEW" | "APPROVED" | "SCHEDULED" | "PUBLISHED" | "MEASURED" | "ARCHIVED";

export type WorkItem = {
  id: string;
  code: string;
  title: string;
  theme: WorkTheme;
  format: WorkFormat;
  language: WorkLanguage;
  status: WorkStatus;
  owner?: string | null;
  dueAt?: string | null;
  publishAt?: string | null;
  assetUrl?: string | null;
  progress: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkSummary = {
  total: number;
  ready: number;
  needsAsset: number;
  measured: number;
  averageProgress: number;
};

export type WorkSnapshot = {
  generatedAt: string;
  summary: WorkSummary;
  items: WorkItem[];
};
