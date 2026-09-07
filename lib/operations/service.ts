import { getContentOperationsOverview } from "./repository";
import type { OperationsOverview } from "./types";

export async function getOperationsOverview(): Promise<OperationsOverview> {
  return getContentOperationsOverview();
}
