export type PlanningActionType = "WRITING" | "DESIGN" | "VIDEO" | "CAROUSEL" | "MESSAGING";

export type PlanningActionPriority = "HIGH" | "MEDIUM" | "LOW";

export type PlanningAction = {
  id: string;
  seasonId: string;
  seasonTitle: string;
  type: PlanningActionType;
  title: string;
  quantity: number;
  priority: PlanningActionPriority;
  suggestedOwner: string;
  dueLabel: string;
  reason: string;
};

export type PlanningOverview = {
  source: string;
  generatedAt: string;
  summary: {
    totalActions: number;
    highPriority: number;
    writingActions: number;
    designActions: number;
    videoActions: number;
    messagingActions: number;
  };
  actions: PlanningAction[];
};
