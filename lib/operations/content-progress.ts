import type { OperationsContentItem } from "./types";

const statusScores: Record<string, number> = {
  IDEA: 15,
  WRITING: 30,
  DESIGN: 50,
  REVIEW: 65,
  APPROVED: 80,
  SCHEDULED: 90,
  PUBLISHED: 100,
};

export function operationsContentProgress(item: OperationsContentItem) {
  const base = statusScores[item.status] ?? 10;
  const copyBonus = item.copy || item.hook || item.cta ? 5 : 0;
  const assetBonus = item.figmaUrl || item.driveUrl || item.videoUrl || item.finalAssetUrl ? 5 : 0;
  return Math.max(0, Math.min(100, base + copyBonus + assetBonus));
}

export function operationsContentProgressLabel(progress: number) {
  if (progress >= 100) return "مكتمل";
  if (progress >= 90) return "جاهز للنشر";
  if (progress >= 80) return "جاهز للتسويق";
  if (progress >= 65) return "في المراجعة";
  if (progress >= 50) return "في الإنتاج";
  if (progress >= 30) return "في الكتابة";
  return "في البداية";
}
