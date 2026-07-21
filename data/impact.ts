import type { ImpactDocument, ImpactRecord, ImpactRegion, ImpactStory } from "@/types/impact";

export const impactDocuments: ImpactDocument[] = [
  { id: "gaza-food-field-report", title: "تقرير ميداني — طرود غذائية لأهل غزة", kind: "field-report", status: "report-pending", note: "REPORT FILE REQUIRED" },
  { id: "quds-restoration-proof", title: "إثبات تنفيذ — ترميم منازل القدس", kind: "delivery-proof", status: "requires-verification", note: "OFFICIAL DOCUMENT REQUIRED" },
  { id: "gaza-water-photos", title: "صور تنفيذ — سقيا الماء في غزة", kind: "field-photos", status: "media-required", note: "APPROVED FIELD MEDIA REQUIRED" },
];

export const impactRecords: ImpactRecord[] = [
  { id: "gaza-food-update", projectId: "gaza-food-parcels", regionLabel: "غزة", executionType: "تجهيز وتسليم طرود غذائية", stage: "تحديث ميداني قيد المراجعة", updateSummary: "تم تسجيل تحديث تنفيذي مرتبط بالمشروع، ويظل تاريخ التنفيذ والنتيجة النهائية قيد الاعتماد.", status: "requires-verification", sourceLabel: "الفريق الميداني — المصدر يحتاج اعتمادًا", documentIds: ["gaza-food-field-report"] },
  { id: "quds-restoration-update", projectId: "al-quds-home-restoration", regionLabel: "القدس", executionType: "ترميم منزل", stage: "توثيق التنفيذ", updateSummary: "توثيق ميداني مرتبط بالمشروع دون إعلان اكتمال نهائي قبل مراجعة الوثائق.", status: "requires-verification", sourceLabel: "ملف المشروع", documentIds: ["quds-restoration-proof"] },
  { id: "gaza-water-update", projectId: "gaza-water", regionLabel: "غزة", executionType: "توفير مياه شرب", stage: "الوسائط مطلوبة", updateSummary: "المشروع نشط، وتحتاج صفحة الأثر إلى وسائط وتاريخ تحديث معتمدين.", status: "media-required", sourceLabel: "بيانات المشروع الأساسية", documentIds: ["gaza-water-photos"] },
];

export const impactRegions: ImpactRegion[] = [
  { id: "gaza", label: "غزة", projectIds: ["gaza-food-parcels", "gaza-water", "gaza-hot-meals"], latestUpdate: "الرقم والتاريخ قيد الاعتماد", impactType: "غذاء ومياه وإغاثة", status: "data-required" },
  { id: "al-quds", label: "القدس", projectIds: ["al-quds-home-restoration", "al-quds-family-relief"], latestUpdate: "تحديث ترميم قيد المراجعة", impactType: "ترميم وإغاثة أسر", status: "requires-verification" },
  { id: "al-aqsa", label: "الأقصى", projectIds: [], latestUpdate: "DATA REQUIRED", impactType: "نوع الأثر قيد الاعتماد", status: "data-required" },
];

export const featuredImpactStory: ImpactStory = {
  id: "featured-restoration-story",
  projectId: "al-quds-home-restoration",
  title: "رحلة توثيق مشروع ترميم في القدس",
  challenge: "تفاصيل الحالة الإنسانية تحتاج ملفًا معتمدًا قبل النشر.",
  intervention: "ربط المشروع بالتحديثات والصور والوثيقة الرسمية عند اعتمادها.",
  currentState: "قصة الأثر قيد إعداد المحتوى والتحقق.",
  documentId: "quds-restoration-proof",
  status: "requires-verification",
};
