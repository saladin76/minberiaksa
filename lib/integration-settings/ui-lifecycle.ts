import type { IntegrationProvider } from "./catalog";

export function shouldResetIntegrationUiState(previousProvider: IntegrationProvider, nextProvider: IntegrationProvider): boolean {
  return previousProvider !== nextProvider;
}
