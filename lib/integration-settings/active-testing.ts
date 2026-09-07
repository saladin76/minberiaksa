import type { IntegrationProvider } from "./catalog";
import { runActiveProviderTest, type ActiveTestCoreDependencies } from "./active-test-core";
import { PROVIDER_STATE_KEY, safeFailureCode } from "./helpers";
import { integrationSettingsService } from "./prisma-service";
import { IntegrationProviderTesterRegistry } from "./provider-testing";
import type {
  IntegrationSettingsActor,
  ProviderConnectionTestResult,
  SafeProviderConnectionTestResponse,
} from "./types";
import type { Prisma } from "@/generated/integration-settings-client";
import { PrismaClient } from "@/generated/integration-settings-client";

export type ActiveTestState = {
  lastTestAt: string | null;
  lastTestResult: "SUCCESS" | "FAILED" | null;
  lastFailureReasonSafe: string | null;
};

type ActiveTestDependencies = Partial<ActiveTestCoreDependencies>;

const globalForActiveTests = globalThis as unknown as { integrationSettingsPrisma?: PrismaClient };
const activeTestPrisma = globalForActiveTests.integrationSettingsPrisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["error", "warn"] : [] });
if (process.env.NODE_ENV !== "production") globalForActiveTests.integrationSettingsPrisma = activeTestPrisma;

function stateCreate(provider: IntegrationProvider, actorId: string, testedAt: Date, result: ProviderConnectionTestResult): Prisma.IntegrationSettingUncheckedCreateInput {
  return {
    provider,
    key: PROVIDER_STATE_KEY,
    encryptedValue: null,
    plainValue: null,
    isSecret: false,
    enabled: true,
    version: 0,
    source: "DATABASE",
    pendingEncryptedValue: null,
    pendingPlainValue: null,
    pendingVersion: null,
    pendingCandidateVersion: null,
    pendingCreatedAt: null,
    pendingUpdatedBy: null,
    candidateVersion: null,
    candidateCreatedAt: null,
    candidateLastTestVersion: null,
    candidateLastTestAt: null,
    candidateLastTestResult: null,
    candidateFailureReasonSafe: null,
    updatedBy: actorId,
    lastTestAt: testedAt,
    lastTestResult: result.success ? "SUCCESS" : "FAILED",
    lastFailureReasonSafe: result.success ? null : safeFailureCode(result.failureCode),
  };
}

export async function recordActiveProviderTest(provider: IntegrationProvider, testedAt: Date, result: ProviderConnectionTestResult, actorId: string): Promise<void> {
  await activeTestPrisma.integrationSetting.upsert({
    where: { provider_key: { provider, key: PROVIDER_STATE_KEY } },
    create: stateCreate(provider, actorId, testedAt, result),
    update: {
      lastTestAt: testedAt,
      lastTestResult: result.success ? "SUCCESS" : "FAILED",
      lastFailureReasonSafe: result.success ? null : safeFailureCode(result.failureCode),
      updatedBy: actorId,
    },
  });
}

export async function getActiveProviderTestState(provider: IntegrationProvider): Promise<ActiveTestState> {
  const state = await activeTestPrisma.integrationSetting.findUnique({
    where: { provider_key: { provider, key: PROVIDER_STATE_KEY } },
    select: { lastTestAt: true, lastTestResult: true, lastFailureReasonSafe: true },
  }).catch(() => null);
  return {
    lastTestAt: state?.lastTestAt?.toISOString() ?? null,
    lastTestResult: state?.lastTestResult === "SUCCESS" || state?.lastTestResult === "FAILED" ? state.lastTestResult : null,
    lastFailureReasonSafe: state?.lastFailureReasonSafe ?? null,
  };
}

export async function testActiveProviderConnection(
  provider: IntegrationProvider,
  actor: IntegrationSettingsActor,
  dependencies: ActiveTestDependencies = {}
): Promise<SafeProviderConnectionTestResponse> {
  const response = await runActiveProviderTest(provider, actor, {
    resolveActiveValues: dependencies.resolveActiveValues ?? ((p, a) => integrationSettingsService.getResolvedProviderValues(p, a)),
    tester: dependencies.tester ?? new IntegrationProviderTesterRegistry(),
    record: dependencies.record ?? recordActiveProviderTest,
    env: dependencies.env ?? process.env,
    now: dependencies.now,
  });
  integrationSettingsService.clearProviderCache(provider);
  return response;
}
