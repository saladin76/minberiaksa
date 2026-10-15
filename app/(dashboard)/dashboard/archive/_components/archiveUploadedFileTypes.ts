import type {
  ArchiveFileAnalysis,
  ArchiveReviewStatus,
  ArchiveUploadCategory,
  ArchiveUploadedFileItem,
  ArchiveUploadReferences,
} from "@/lib/archive/uploaded-files";
import { dashIntl, dt } from "@/lib/dashboard/i18n";

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
  { value: "NEW", get label() { return dt("جديد"); } },
  { value: "REVIEWED", get label() { return dt("تمت المراجعة"); } },
  { value: "IMPORTANT", get label() { return dt("مهم"); } },
];

export function fileCategoryOptions(category: Category) {
  return category === "MARKETING"
    ? [dt("خطط حملات"), dt("تقارير نتائج"), dt("ملفات مشاريع"), dt("محتوى إعلاني"), dt("ميزانيات")]
    : [dt("عقود"), dt("تراخيص"), dt("أوراق المؤسسة"), dt("شراكات"), dt("تقارير رسمية")];
}

export function statusLabel(value: ReviewStatus) {
  return reviewStatuses.find((status) => status.value === value)?.label ?? dt("جديد");
}

export function storageLabel(file: UploadedFile) {
  if (file.storageMode === "BLOB") return "Blob";
  if (file.storageMode === "CLIENT_CHUNKED") return dt("{0} أجزاء", [file.chunkCount || 1]);
  if (file.storageMode === "CHUNKED") return dt("{0} أجزاء", [file.chunkCount || 1]);
  return dt("مباشر");
}

export function formatArchiveDate(value: string) {
  return new Intl.DateTimeFormat(dashIntl("ar"), { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatArchiveBytes(value: number) {
  if (!value) return "-";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
