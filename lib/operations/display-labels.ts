export const operationsStatusLabels: Record<string, string> = {
  IDEA: "فكرة",
  WRITING: "كتابة",
  DESIGN: "تصميم",
  REVIEW: "مراجعة",
  APPROVED: "معتمد",
  SCHEDULED: "مجدول",
  PUBLISHED: "منشور",
  IN_PROGRESS: "قيد التنفيذ",
  PLANNING: "تخطيط",
  ACTIVE: "نشط",
  UPCOMING: "قادم",
};

export const operationsContentTypeLabels: Record<string, string> = {
  DESIGN: "تصميم",
  VIDEO: "فيديو",
  REEL: "ريل",
  CAROUSEL: "كاروسيل",
  STORY: "قصة",
  EMAIL: "إيميل",
  MESSAGE: "رسالة",
  COPY: "نص",
  SCRIPT: "سكريبت",
};

export function operationsStatusLabel(status: string) {
  return operationsStatusLabels[status] ?? status;
}

export function operationsContentTypeLabel(type: string) {
  return operationsContentTypeLabels[type] ?? type;
}
