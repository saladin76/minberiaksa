import type { SafeIntegrationProviderSnapshot } from "./types";
import { getActiveProviderTestState, type ActiveTestState } from "./active-testing";

export type SafeIntegrationProviderSnapshotWithTests = SafeIntegrationProviderSnapshot & {
  activeTest: ActiveTestState;
};

export async function withActiveTestState(snapshot: SafeIntegrationProviderSnapshot): Promise<SafeIntegrationProviderSnapshotWithTests> {
  return { ...snapshot, activeTest: await getActiveProviderTestState(snapshot.provider) };
}
