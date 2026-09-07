import { listProductionItems } from "../repository";
import { productionStages } from "./production-data";
import type { ProductionBoardOverview } from "./production-types";

export async function getProductionBoardOverview(): Promise<ProductionBoardOverview> {
  const dataset = await listProductionItems();
  const productionItems = dataset.items;
  const columns = productionStages.map((stage) => ({
    ...stage,
    items: productionItems.filter((item) => item.stage === stage.stage),
  }));

  return {
    source: "production-board-repository",
    generatedAt: new Date().toISOString(),
    persistence: dataset.persistence,
    summary: {
      totalItems: productionItems.length,
      inProduction: productionItems.filter((item) => !["READY", "PUBLISHED"].includes(item.stage)).length,
      ready: productionItems.filter((item) => item.stage === "READY").length,
      published: productionItems.filter((item) => item.stage === "PUBLISHED").length,
      usedInAds: productionItems.filter((item) => item.isUsedInAds).length,
      highPriority: productionItems.filter((item) => item.priority === "HIGH").length,
    },
    columns,
  };
}
