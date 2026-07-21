import type { ContentDataStatus } from "./impact";

export type StoryKind = "reel" | "documentary" | "photo" | "report";
export type StoryTopic = "gaza" | "al-quds" | "al-aqsa" | "waqf" | "zakat" | "relief" | "reports";

export type StoryMedia = {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  kind: StoryKind;
  topics: StoryTopic[];
  duration?: string;
  publishedAt?: string;
  status: ContentDataStatus;
  posterAssetId?: string;
  videoUrl?: string;
  captions?: string;
  sourceLabel: string;
  gallery?: Array<{ src?: string; alt: string; caption: string; sourceStatus: ContentDataStatus }>;
  reportId?: string;
};
