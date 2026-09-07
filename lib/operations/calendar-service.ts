import { operationsAlertRules, operationsCalendarEvents } from "./calendar-data";

export function getOperationsCalendarOverview() {
  const highPriority = operationsCalendarEvents.filter((event) => event.priority === "HIGH").length;
  const totalAssets = operationsCalendarEvents.reduce((total, event) => total + event.requiredAssets.length, 0);

  return {
    source: "foundation-static",
    generatedAt: new Date().toISOString(),
    kpis: {
      totalEvents: operationsCalendarEvents.length,
      highPriority,
      totalAssets,
    },
    events: operationsCalendarEvents,
    alertRules: operationsAlertRules,
  };
}
