export type KnowledgeTopic = "zakat" | "waqf" | "recurring" | "al-quds" | "gaza" | "transparency" | "donation-journey";
export type ReviewStatus = "institution-approved" | "sharia-review-required" | "legal-review-required" | "sources-required" | "draft";

export type ArticleSection = {
  id: string;
  heading: string;
  paragraphs: string[];
  note?: string;
};

export type KnowledgeArticle = {
  slug: string;
  title: string;
  summary: string;
  topic: KnowledgeTopic;
  tags: string[];
  projectId?: string;
  publishedAt?: string;
  reviewStatus: ReviewStatus;
  readingMinutes: number;
  heroAssetId?: string;
  sections: ArticleSection[];
  sources: string[];
  relatedSlugs: string[];
};
