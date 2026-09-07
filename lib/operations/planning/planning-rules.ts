import type { PlanningActionPriority, PlanningActionType } from "./planning-types";

export type PlanningRule = {
  assetLabelIncludes: string;
  type: PlanningActionType;
  suggestedOwner: string;
  dueLabel: string;
};

export const planningRules: PlanningRule[] = [
  { assetLabelIncludes: "فيديو", type: "VIDEO", suggestedOwner: "فريق الميديا", dueLabel: "هذا الأسبوع" },
  { assetLabelIncludes: "تصاميم", type: "DESIGN", suggestedOwner: "فريق التصميم", dueLabel: "هذا الأسبوع" },
  { assetLabelIncludes: "تصميم", type: "DESIGN", suggestedOwner: "فريق التصميم", dueLabel: "هذا الأسبوع" },
  { assetLabelIncludes: "كاروسيل", type: "CAROUSEL", suggestedOwner: "فريق المحتوى والتصميم", dueLabel: "الأسبوع القادم" },
  { assetLabelIncludes: "واتساب", type: "MESSAGING", suggestedOwner: "فريق التسويق", dueLabel: "قبل الإطلاق" },
];

export function getPlanningPriority(readinessScore: number, startsInDays: number): PlanningActionPriority {
  if (readinessScore < 45 || startsInDays <= 21) return "HIGH";
  if (readinessScore < 70) return "MEDIUM";
  return "LOW";
}
