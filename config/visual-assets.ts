export type VisualAssetStatus = "available";
export type VisualAsset = { id: string; type: "pattern"; path: string; alt: string; status: VisualAssetStatus; replacementNote: string };
export const visualAssets: VisualAsset[] = [{ id: "islamic-pattern", type: "pattern", path: "/assets/patterns/aqsa-white-pattern.webp", alt: "زخرفة مقدسية خفيفة", status: "available", replacementNote: "" }];
