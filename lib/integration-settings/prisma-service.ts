import type { Prisma } from "@/generated/integration-settings-client";
import { PrismaClient } from "@/generated/integration-settings-client";
import { writeAuditLog } from "@/lib/audit-log";
import type { IntegrationProvider } from "./catalog";
import { PROVIDER_STATE_KEY } from "./helpers";
import type { ActiveRuntimeResolution } from "./resolver";
import { IntegrationSettingsResolver } from "./resolver";
import {
  IntegrationSettingsService,
  type CandidateActivationResult,
  type CandidateDiscardResult,
  type CandidateTestStatePatch,
  type IntegrationSettingMutation,
  type IntegrationSettingRecord,
  type IntegrationSettingsActor,
  type IntegrationSettingsAuditEntry,
  type IntegrationSettingsAuditWriter,
  type IntegrationSettingsRepository,
} from "./service";

const globalForIntegrationSettings = globalThis as unknown as { integrationSettingsPrisma?: PrismaClient };
const integrationSettingsPrisma = globalForIntegrationSettings.integrationSettingsPrisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : [],
});
if (process.env.NODE_ENV !== "production") globalForIntegrationSettings.integrationSettingsPrisma = integrationSettingsPrisma;

class PrismaIntegrationSettingsRepository implements IntegrationSettingsRepository {
  async listByProvider(provider: Parameters<IntegrationSettingsRepository["listByProvider"]>[0]): Promise<IntegrationSettingRecord[]> {
    const rows = await integrationSettingsPrisma.integrationSetting.findMany({ where: { provider }, orderBy: { key: "asc" } });
    return rows as IntegrationSettingRecord[];
  }

  async applyMutations(mutations: readonly IntegrationSettingMutation[]): Promise<IntegrationSettingRecord[]> {
    if (!mutations.length) return [];
    const operations = mutations.map((mutation) => {
      if (mutation.type === "CREATE") return integrationSettingsPrisma.integrationSetting.create({ data: mutation.data as Prisma.IntegrationSettingUncheckedCreateInput });
      if (mutation.type === "UPDATE") return integrationSettingsPrisma.integrationSetting.update({ where: { provider_key: { provider: mutation.provider, key: mutation.key } }, data: mutation.patch as Prisma.IntegrationSettingUncheckedUpdateInput });
      return integrationSettingsPrisma.integrationSetting.delete({ where: { provider_key: { provider: mutation.provider, key: mutation.key } } });
    });
    return (await integrationSettingsPrisma.$transaction(operations)) as IntegrationSettingRecord[];
  }

  async recordCandidateTestResult(provider: Parameters<IntegrationSettingsRepository["recordCandidateTestResult"]>[0], candidateVersion: string, patch: CandidateTestStatePatch): Promise<boolean> {
    const result = await integrationSettingsPrisma.integrationSetting.updateMany({
      where: { provider, key: PROVIDER_STATE_KEY, candidateVersion },
      data: patch,
    });
    return result.count === 1;
  }

  async activateCandidateAtomically(provider: Parameters<IntegrationSettingsRepository["activateCandidateAtomically"]>[0], candidateVersion: string, actorId: string): Promise<CandidateActivationResult> {
    return integrationSettingsPrisma.$transaction(async (tx) => {
      const state = await tx.integrationSetting.findUnique({ where: { provider_key: { provider, key: PROVIDER_STATE_KEY } } });
      if (!state?.candidateVersion) return { status: "CANDIDATE_NOT_FOUND" };
      if (state.candidateVersion !== candidateVersion) return { status: "VERSION_MISMATCH" };
      if (state.candidateLastTestVersion !== candidateVersion || state.candidateLastTestResult !== "SUCCESS" || !state.candidateLastTestAt || !state.candidateCreatedAt || state.candidateLastTestAt < state.candidateCreatedAt) return { status: "NOT_VERIFIED" };
      const pending = await tx.integrationSetting.findMany({ where: { provider, pendingCandidateVersion: candidateVersion } });
      if (!pending.length) return { status: "EMPTY_CANDIDATE" };
      for (const row of pending) {
        await tx.integrationSetting.update({
          where: { provider_key: { provider, key: row.key } },
          data: {
            encryptedValue: row.isSecret ? row.pendingEncryptedValue : null,
            plainValue: row.isSecret ? null : row.pendingPlainValue,
            version: row.pendingVersion ?? row.version + 1,
            source: "DATABASE",
            updatedBy: actorId,
            pendingEncryptedValue: null,
            pendingPlainValue: null,
            pendingVersion: null,
            pendingCandidateVersion: null,
            pendingCreatedAt: null,
            pendingUpdatedBy: null,
            lastTestAt: state.candidateLastTestAt,
            lastTestResult: "SUCCESS",
            lastFailureReasonSafe: null,
          },
        });
      }
      await tx.integrationSetting.update({
        where: { provider_key: { provider, key: PROVIDER_STATE_KEY } },
        data: {
          candidateVersion: null,
          candidateCreatedAt: null,
          candidateLastTestVersion: null,
          candidateLastTestAt: null,
          candidateLastTestResult: null,
          candidateFailureReasonSafe: null,
          updatedBy: actorId,
          lastTestAt: state.candidateLastTestAt,
          lastTestResult: "SUCCESS",
          lastFailureReasonSafe: null,
        },
      });
      return { status: "ACTIVATED", activatedFields: pending.length };
    });
  }

  async discardCandidateAtomically(provider: Parameters<IntegrationSettingsRepository["discardCandidateAtomically"]>[0], candidateVersion: string): Promise<CandidateDiscardResult> {
    return integrationSettingsPrisma.$transaction(async (tx) => {
      const state = await tx.integrationSetting.findUnique({ where: { provider_key: { provider, key: PROVIDER_STATE_KEY } } });
      if (!state?.candidateVersion) return { status: "CANDIDATE_NOT_FOUND" };
      if (state.candidateVersion !== candidateVersion) return { status: "VERSION_MISMATCH" };
      const pending = await tx.integrationSetting.findMany({ where: { provider, pendingCandidateVersion: candidateVersion } });
      for (const row of pending) {
        await tx.integrationSetting.update({
          where: { provider_key: { provider, key: row.key } },
          data: { pendingEncryptedValue: null, pendingPlainValue: null, pendingVersion: null, pendingCandidateVersion: null, pendingCreatedAt: null, pendingUpdatedBy: null },
        });
      }
      await tx.integrationSetting.update({
        where: { provider_key: { provider, key: PROVIDER_STATE_KEY } },
        data: { candidateVersion: null, candidateCreatedAt: null, candidateLastTestVersion: null, candidateLastTestAt: null, candidateLastTestResult: null, candidateFailureReasonSafe: null },
      });
      return { status: "DISCARDED", discardedFields: pending.length };
    });
  }
}

class AuditLogIntegrationSettingsWriter implements IntegrationSettingsAuditWriter {
  async write(entry: IntegrationSettingsAuditEntry): Promise<void> {
    await writeAuditLog({
      actorId: entry.actor.actorId,
      actorName: entry.actor.actorName,
      actorRole: entry.actor.actorRole,
      action: entry.action,
      messageAr: `${entry.success ? "نجحت" : "فشلت"} عملية إدارة إعدادات ${entry.provider}`,
      entityType: "IntegrationSetting",
      entityId: entry.key ? `${entry.provider}:${entry.key}` : entry.provider,
      metadata: { provider: entry.provider, key: entry.key ?? null, success: entry.success, ...(entry.metadata ?? {}) },
      stream: "TEAM",
    });
  }
}

const repository = new PrismaIntegrationSettingsRepository();
const auditWriter = new AuditLogIntegrationSettingsWriter();
const runtimeResolver = new IntegrationSettingsResolver(repository, auditWriter, { cacheTtlMs: 30_000 });

export const integrationSettingsService = new IntegrationSettingsService(repository, auditWriter, { cacheTtlMs: 30_000 });

export function getActiveIntegrationRuntimeResolution(provider: IntegrationProvider, actor?: IntegrationSettingsActor): Promise<ActiveRuntimeResolution> {
  return runtimeResolver.getActiveRuntimeResolution(provider, actor);
}

export function clearActiveIntegrationRuntimeCache(provider: IntegrationProvider): void {
  runtimeResolver.clearProviderCache(provider);
}
