import type { SeasonReadinessResult } from "@/lib/operations/seasons/season-types";
import { getPlanningPriority, planningRules } from "./planning-rules";
import type { PlanningAction } from "./planning-types";

function normalizeArabicLabel(value: string) {
  return value.trim().toLowerCase();
}

function findRule(assetLabel: string) {
  const normalized = normalizeArabicLabel(assetLabel);
  return planningRules.find((rule) => normalized.includes(normalizeArabicLabel(rule.assetLabelIncludes)));
}

function buildActionId(seasonId: string, assetLabel: string) {
  return `${seasonId}-${assetLabel.replace(/\s+/g, "-").toLowerCase()}`;
}

export function generatePlanningActionsForSeason(season: SeasonReadinessResult): PlanningAction[] {
  if (season.missingAssets <= 0) return [];

  return season.assetTargets
    .map((asset) => {
      const missing = Math.max(asset.required - asset.ready, 0);
      if (missing <= 0) return null;

      const rule = findRule(asset.label);
      const priority = getPlanningPriority(season.readinessScore, season.startsInDays);
      const type = rule?.type ?? "WRITING";
      const suggestedOwner = rule?.suggestedOwner ?? "فريق المحتوى";
      const dueLabel = season.startsInDays <= 21 ? "عاجل هذا الأسبوع" : rule?.dueLabel ?? "هذا الأسبوع";

      return {
        id: buildActionId(season.seasonId, asset.label),
        seasonId: season.seasonId,
        seasonTitle: season.title,
        type,
        title: `إنتاج ${missing} ${asset.label} لموسم ${season.title}`,
        quantity: missing,
        priority,
        suggestedOwner,
        dueLabel,
        reason: `الجاهز ${asset.ready} من ${asset.required}، والجاهزية العامة ${season.readinessScore}%.`,
      } satisfies PlanningAction;
    })
    .filter((action): action is PlanningAction => Boolean(action));
}

export function generatePlanningActions(seasons: SeasonReadinessResult[]): PlanningAction[] {
  return seasons.flatMap(generatePlanningActionsForSeason);
}
