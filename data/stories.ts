import type { StoryMedia } from "@/types/stories";

export const stories: StoryMedia[] = [
  { id: "gaza-food-field-film", projectId: "gaza-food-parcels", title: "من الميدان: رحلة الطرد الغذائي", summary: "معاينة لقصة ميدانية تربط المشروع بمرحلة التنفيذ والتقرير عند اعتماده.", kind: "documentary", topics: ["gaza", "relief", "reports"], status: "media-required", sourceLabel: "OFFICIAL VIDEO URL REQUIRED", reportId: "gaza-food-field-report" },
  { id: "quds-restoration-reel", projectId: "al-quds-home-restoration", title: "تفاصيل من مشروع الترميم", summary: "قصة رأسية مؤسسية، لا تُعرض كفيديو فعلي قبل اعتماد الرابط والملصق.", kind: "reel", topics: ["al-quds", "waqf"], duration: "DURATION REQUIRED", status: "media-required", sourceLabel: "APPROVED POSTER AND VIDEO REQUIRED", reportId: "quds-restoration-proof" },
  { id: "gaza-water-photo-story", projectId: "gaza-water", title: "مشاهد من رحلة سقيا الماء", summary: "معرض تحريري يحتاج صورًا ميدانية معتمدة وغير متكررة.", kind: "photo", topics: ["gaza", "relief"], status: "media-required", sourceLabel: "APPROVED FIELD PHOTOS REQUIRED", gallery: [
    { alt: "صورة ميدانية مطلوبة لمشروع سقيا الماء", caption: "CAPTION REQUIRED", sourceStatus: "media-required" },
    { alt: "صورة تنفيذ ثانوية مطلوبة", caption: "DATE AND SOURCE REQUIRED", sourceStatus: "media-required" },
  ], reportId: "gaza-water-photos" },
  { id: "zakat-impact-explainer", projectId: "gaza-food-parcels", title: "كيف يرتبط تحديث المشروع بتقرير الأثر؟", summary: "شرح قصير يربط مشروع الزكاة بالتحديث الميداني والوثيقة.", kind: "report", topics: ["zakat", "reports"], status: "report-pending", sourceLabel: "REPORT PENDING", reportId: "gaza-food-field-report" },
];
