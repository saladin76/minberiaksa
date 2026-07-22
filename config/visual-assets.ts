export type VisualAssetStatus = "approved" | "temporary" | "required" | "needs-optimization";

export type VisualAsset = {
  id: string;
  type: string;
  path: string | null;
  alt: string;
  status: VisualAssetStatus;
  replacementNote: string;
};

export const visualAssets: VisualAsset[] = [
  { id: "al-quds-gold-coin", type: "coin", path: null, alt: "عملة ذهبية منقوش عليها القدس أو الأقصى", status: "required", replacementNote: "APPROVED AL-QUDS GOLD COIN ASSET REQUIRED" },
  { id: "waqf-certificate", type: "document", path: null, alt: "شهادة وقف رسمية", status: "required", replacementNote: "Official certificate artwork required" },
  { id: "waqf-letter", type: "document", path: null, alt: "خطاب رسمي للمؤسسة", status: "required", replacementNote: "Official letter preview required" },
  { id: "approved-islamic-pattern", type: "pattern", path: "/assets/patterns/aqsa-white-pattern.webp", alt: "زخرفة مقدسية خفيفة", status: "approved", replacementNote: "High-resolution seamless Aqsa pattern; PNG fallback is declared in CSS" }
];
