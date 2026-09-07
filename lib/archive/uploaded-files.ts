export const ARCHIVE_UPLOAD_CATEGORIES = ["MARKETING", "DOCUMENTS"] as const;
export type ArchiveUploadCategory = (typeof ARCHIVE_UPLOAD_CATEGORIES)[number];
export type ArchiveReviewStatus = "NEW" | "REVIEWED" | "IMPORTANT";

export const ARCHIVE_MAX_FILE_BYTES = 30 * 1024 * 1024;
export const ARCHIVE_BASE64_CHUNK_SIZE = 3_500_000;
export const ARCHIVE_CLIENT_CHUNK_MAX_BYTES = 2 * 1024 * 1024;
export const ARCHIVE_ALLOWED_EXTENSIONS = ["pdf", "xls", "xlsx"];
export const ARCHIVE_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
];

export type ArchiveFileAnalysis = {
  summary: string;
  suggestedCategory: string;
  suggestedUse: string;
  keywords: string[];
  teamNotes: string[];
  confidence: "metadata_only" | "ai_assisted" | string;
};

export type ArchiveUploadReferences = {
  collections: { id: string; name: string }[];
  projects: { id: string; title: string; collectionId: string; year: number }[];
};

export type ArchiveUploadedFileItem = {
  id: string;
  category: ArchiveUploadCategory;
  title: string;
  notes: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extension: string;
  fileCategory: string;
  reviewStatus: ArchiveReviewStatus;
  uploadStatus: string;
  storageMode: string;
  chunkCount: number;
  linkedCollectionId: string;
  linkedCollectionName: string;
  linkedProjectId: string;
  linkedProjectName: string;
  aiAnalysis: ArchiveFileAnalysis | null;
  aiAnalyzedAt: string;
  createdAt: string;
  uploadedBy: string;
};

export function parseArchiveUploadCategory(value: unknown): ArchiveUploadCategory | null {
  return ARCHIVE_UPLOAD_CATEGORIES.includes(value as ArchiveUploadCategory) ? (value as ArchiveUploadCategory) : null;
}

export function defaultArchiveFileCategory(category: ArchiveUploadCategory) {
  return category === "MARKETING" ? "ملفات مشاريع" : "أوراق المؤسسة";
}

export function archiveUploadMessage(category: ArchiveUploadCategory, mode: "started" | "completed" | "direct") {
  if (category === "MARKETING") {
    return mode === "started" ? "بدء رفع ملف مشروع تسويقي" : "تم رفع ملف مشروع تسويقي";
  }
  return mode === "started" ? "بدء رفع مستند أرشيفي" : "تم رفع مستند أرشيفي";
}

export function archiveUploadMessageEn(category: ArchiveUploadCategory, mode: "started" | "completed" | "direct") {
  if (category === "MARKETING") {
    return mode === "started" ? "Marketing archive file upload started" : "Marketing archive file uploaded";
  }
  return mode === "started" ? "Document archive file upload started" : "Document archive file uploaded";
}

export function archiveExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

export function isAllowedArchiveFile(extension: string, mimeType = "") {
  return ARCHIVE_ALLOWED_EXTENSIONS.includes(extension) || ARCHIVE_ALLOWED_MIME_TYPES.includes(mimeType);
}

export function mimeFromArchiveExtension(extension: string) {
  if (extension === "pdf") return "application/pdf";
  if (extension === "xls") return "application/vnd.ms-excel";
  if (extension === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/octet-stream";
}

export function chunkString(value: string, size: number) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += size) chunks.push(value.slice(index, index + size));
  return chunks;
}

export function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function buildArchiveUploadReferences(
  collections: { id: string; name: string }[],
  projects: { id: string; title: string; collectionId: string; year: number }[],
): ArchiveUploadReferences {
  return {
    collections: collections.map((item) => ({ id: item.id, name: item.name })),
    projects: projects.map((item) => ({ id: item.id, title: item.title, collectionId: item.collectionId, year: item.year })),
  };
}

export function validArchiveCollectionId(value: string, references: ArchiveUploadReferences) {
  return references.collections.some((item) => item.id === value) ? value : "";
}

export function validArchiveProjectId(value: string, references: ArchiveUploadReferences) {
  return references.projects.some((item) => item.id === value) ? value : "";
}

export function referenceName(id: string, items: { id: string; name?: string; title?: string }[]) {
  return items.find((item) => item.id === id)?.name || items.find((item) => item.id === id)?.title || "";
}

export function normalizeArchiveFileAnalysis(value: unknown): ArchiveFileAnalysis | null {
  const analysis = metadataObject(value);
  if (!analysis.summary) return null;
  return {
    summary: stringField(analysis.summary),
    suggestedCategory: stringField(analysis.suggestedCategory),
    suggestedUse: stringField(analysis.suggestedUse),
    keywords: Array.isArray(analysis.keywords) ? analysis.keywords.map(stringField).filter(Boolean).slice(0, 10) : [],
    teamNotes: Array.isArray(analysis.teamNotes) ? analysis.teamNotes.map(stringField).filter(Boolean).slice(0, 5) : [],
    confidence: stringField(analysis.confidence) || "metadata_only",
  };
}

export function toArchiveUploadedFileItem(
  row: { id: string; createdAt: Date; actorName?: string | null; metadata: unknown },
  references: ArchiveUploadReferences,
): ArchiveUploadedFileItem | null {
  const metadata = metadataObject(row.metadata);
  const category = parseArchiveUploadCategory(stringField(metadata.category));
  if (!category) return null;

  const linkedCollectionId = stringField(metadata.linkedCollectionId);
  const linkedProjectId = stringField(metadata.linkedProjectId);
  const reviewStatus = stringField(metadata.reviewStatus) as ArchiveReviewStatus;

  return {
    id: row.id,
    category,
    title: stringField(metadata.title) || stringField(metadata.fileName) || "ملف",
    notes: stringField(metadata.notes),
    fileName: stringField(metadata.fileName),
    mimeType: stringField(metadata.mimeType),
    sizeBytes: numberField(metadata.sizeBytes),
    extension: stringField(metadata.extension),
    fileCategory: stringField(metadata.fileCategory) || defaultArchiveFileCategory(category),
    reviewStatus: ["NEW", "REVIEWED", "IMPORTANT"].includes(reviewStatus) ? reviewStatus : "NEW",
    uploadStatus: stringField(metadata.uploadStatus) || "READY",
    storageMode: stringField(metadata.storageMode) || "INLINE",
    chunkCount: numberField(metadata.chunkCount) || 1,
    linkedCollectionId,
    linkedCollectionName: referenceName(linkedCollectionId, references.collections),
    linkedProjectId,
    linkedProjectName: referenceName(linkedProjectId, references.projects),
    aiAnalysis: normalizeArchiveFileAnalysis(metadata.aiAnalysis),
    aiAnalyzedAt: stringField(metadata.aiAnalyzedAt),
    createdAt: row.createdAt.toISOString(),
    uploadedBy: row.actorName || "الفريق",
  };
}
