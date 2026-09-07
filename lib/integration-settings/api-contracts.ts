import { z } from "zod";

export const integrationSettingsUpdateSchema = z.object({
  settings: z.array(z.object({
    key: z.string().min(1).max(80),
    value: z.string().max(10_000),
  })).min(1).max(20),
});

export const integrationSettingDeleteSchema = z.object({
  key: z.string().min(1).max(80),
  confirm: z.literal(true),
});

export const integrationProviderActionSchema = z.object({
  action: z.enum(["ENABLE", "DISABLE"]),
});

export const providerConnectionTestSchema = z.object({}).strict();

export const providerCandidateActivationSchema = z.object({
  candidateVersion: z.string().uuid(),
});

export const providerCandidateDiscardSchema = z.object({
  candidateVersion: z.string().uuid(),
  failureReason: z.string().max(96).optional().nullable(),
});

export const INTEGRATION_SETTINGS_ROUTE_PERMISSIONS = {
  read: "platformConnections",
  save: "platformConnectionsManage",
  test: "platformConnectionsTest",
  activateCandidate: "platformConnectionsManage",
  discardCandidate: "platformConnectionsManage",
  delete: "platformConnectionsAdmin",
  providerStatus: "platformConnectionsAdmin",
} as const;
