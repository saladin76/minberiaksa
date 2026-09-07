import type { IntegrationProvider } from "./catalog";
import type { SafeIntegrationProviderSnapshot } from "./types";

export type IntegrationUiDrafts = Record<string, string>;

export const INTEGRATION_UI_ENDPOINTS = {
  testActive: (provider: IntegrationProvider) => `/api/admin/integration-settings/${provider}/test-active`,
  testCandidate: (provider: IntegrationProvider) => `/api/admin/integration-settings/${provider}/test-candidate`,
  activateCandidate: (provider: IntegrationProvider) => `/api/admin/integration-settings/${provider}/activate-candidate`,
  discardCandidate: (provider: IntegrationProvider) => `/api/admin/integration-settings/${provider}/discard-candidate`,
  rotateBrevoWebhook: "/api/admin/integration-settings/BREVO/webhook-token",
} as const;

export function initializeIntegrationDrafts(snapshot: SafeIntegrationProviderSnapshot): IntegrationUiDrafts {
  return Object.fromEntries(snapshot.fields.map((field) => [field.key, field.isSecret ? "" : field.displayValue ?? ""]));
}

export function buildIntegrationSettingsPatch(
  snapshot: SafeIntegrationProviderSnapshot,
  drafts: IntegrationUiDrafts,
  dirtyKeys: ReadonlySet<string>
): { settings: { key: string; value: string }[] } {
  if (snapshot.provider === "SYSTEM") return { settings: [] };
  return {
    settings: snapshot.fields
      .filter((field) => dirtyKeys.has(field.key))
      .filter((field) => !field.isSecret || (drafts[field.key] ?? "").length > 0)
      .map((field) => ({ key: field.key, value: drafts[field.key] ?? "" })),
  };
}

export function providerConnectionTestBody(): Record<string, never> {
  return {};
}

export function providerCandidateBody(candidateVersion: string): { candidateVersion: string } {
  return { candidateVersion };
}

export function payloadContainsSecret(payload: unknown, secretValues: readonly string[]): boolean {
  const serialized = JSON.stringify(payload);
  return secretValues.some((value) => !!value && serialized.includes(value));
}
