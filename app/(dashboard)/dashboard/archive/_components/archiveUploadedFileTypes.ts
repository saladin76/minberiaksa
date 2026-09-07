import type {
  ArchiveFileAnalysis,
  ArchiveReviewStatus,
  ArchiveUploadCategory,
  ArchiveUploadedFileItem,
  ArchiveUploadReferences,
} from "@/lib/archive/uploaded-files";

export type Category = ArchiveUploadCategory;
export type ReviewStatus = ArchiveReviewStatus;
export type FileAnalysis = ArchiveFileAnalysis;
export type UploadedFile = ArchiveUploadedFileItem;
export type ArchiveRefs = ArchiveUploadReferences;

export type Feedback = {
  tone: "success" | "error";
  message: string;
};

export const emptyArchiveRefs: ArchiveRefs = {
  collections: [],
  projects: [],
};

export const reviewStatuses: { value: ReviewStatus; label: string }[] = [
  { value: "NEW", label: "جديد" },
  { value: "REVIEWED", label: "تمت المراجعة" },
  { value: "IMPORTANT", label: "مهم" },
];

export function fileCategoryOptions(category: Category) {
  return category === "MARKETING"
    ? ["خطط حملات", "تقارير نتائج", "ملفات مشاريع", "محتوى إعلاني", "ميزانيات"]
    : ["عقود", "تراخيص", "أوراق المؤسسة", "شراكات", "تقارير رسمية"];
}

export function statusLabel(value: ReviewStatus) {
  return reviewStatuses.find((status) => status.value === value)?.label ?? "جديد";
}

export function storageLabel(file: UploadedFile) {
  if (file.storageMode === "BLOB") return "Blob";
  if (file.storageMode === "CLIENT_CHUNKED") return `${file.chunkCount || 1} أجزاء`;
  if (file.storageMode === "CHUNKED") return `${file.chunkCount || 1} أجزاء`;
  return "مباشر";
}

export function formatArchiveDate(value: string) {
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatArchiveBytes(value: number) {
  if (!value) return "-";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
