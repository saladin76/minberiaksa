import type { OperationsSeasonDefinition, SeasonReadinessResult } from "./season-types";

function getSeasonStatus(readinessScore: number, startsInDays: number): SeasonReadinessResult["status"] {
  if (readinessScore >= 70) return "ON_TRACK";
  if (startsInDays <= 21 || readinessScore < 40) return "LATE";
  return "NEEDS_ATTENTION";
}

function buildSeasonAlerts(season: OperationsSeasonDefinition, readinessScore: number, missingAssets: number): string[] {
  const alerts: string[] = [];

  if (season.startsInDays <= season.leadTimeDays) {
    alerts.push(`بدأت نافذة التحضير لموسم ${season.title}.`);
  }

  if (missingAssets > 0) {
    alerts.push(`ينقص الموسم ${missingAssets} مادة إنتاجية للوصول للخطة.`);
  }

  if (readinessScore < 50) {
    alerts.push("الجاهزية أقل من 50% وتحتاج متابعة عاجلة من فريق المحتوى.");
  }

  if (alerts.length === 0) {
    alerts.push("الموسم يسير بشكل جيد وفق بيانات الجاهزية الحالية.");
  }

  return alerts;
}

export function calculateSeasonReadiness(season: OperationsSeasonDefinition): SeasonReadinessResult {
  const requiredAssets = season.assetTargets.reduce((total, asset) => total + asset.required, 0);
  const readyAssets = season.assetTargets.reduce((total, asset) => total + asset.ready, 0);
  const missingAssets = Math.max(requiredAssets - readyAssets, 0);
  const readinessScore = requiredAssets > 0 ? Math.round((readyAssets / requiredAssets) * 100) : 100;

  return {
    seasonId: season.id,
    title: season.title,
    focus: season.focus,
    priority: season.priority,
    startsInDays: season.startsInDays,
    leadTimeDays: season.leadTimeDays,
    readinessScore,
    requiredAssets,
    readyAssets,
    missingAssets,
    status: getSeasonStatus(readinessScore, season.startsInDays),
    alerts: buildSeasonAlerts(season, readinessScore, missingAssets),
    assetTargets: season.assetTargets,
  };
}

export function calculateSeasonsReadiness(seasons: OperationsSeasonDefinition[]): SeasonReadinessResult[] {
  return seasons.map(calculateSeasonReadiness);
}
