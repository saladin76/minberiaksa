import { getSeasonReadinessOverview } from "@/lib/operations/seasons/season-service";
import { generatePlanningActions } from "./planning-engine";
import type { PlanningOverview } from "./planning-types";

export function getPlanningOverview(): PlanningOverview {
  const seasonOverview = getSeasonReadinessOverview();
  const actions = generatePlanningActions(seasonOverview.seasons);

  return {
    source: "planning-engine-foundation",
    generatedAt: new Date().toISOString(),
    summary: {
      totalActions: actions.length,
      highPriority: actions.filter((action) => action.priority === "HIGH").length,
      writingActions: actions.filter((action) => action.type === "WRITING").length,
      designActions: actions.filter((action) => action.type === "DESIGN").length,
      videoActions: actions.filter((action) => action.type === "VIDEO").length,
      messagingActions: actions.filter((action) => action.type === "MESSAGING").length,
    },
    actions,
  };
}
