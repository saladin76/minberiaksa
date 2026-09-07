import { PrismaClient } from "../generated/integration-settings-client";
import { decryptIntegrationSecret, integrationSecretContext } from "../lib/integration-settings/crypto";
import { EXPECTED_INTEGRATION_SETTING_INDEXES, INTEGRATION_SETTING_COLLECTION, inspectIndexDefinitions, type MongoIndexDescription, type ReleaseCheck } from "../lib/integration-settings/release-readiness";

export type IntegrationDbInspection = {
  connected: boolean;
  collectionExists: boolean;
  documentCount: number;
  duplicateKeys: Array<{ provider: string; key: string; count: number }>;
  indexes: MongoIndexDescription[];
  indexChecks: ReleaseCheck[];
  staleCandidates: Array<{ provider: string; candidateVersion: string | null; createdAt: string | null }>;
  unreadableSecrets: Array<{ provider: string; key: string }>;
  transactions: { status: "SUPPORTED" | "WARNING"; message: string };
};

type RawCursor<T> = { cursor?: { firstBatch?: T[] } };

type ListCollectionRow = { name?: string };
type RawIndex = { name?: string; key?: Record<string, number>; unique?: boolean };
type DuplicateRow = { _id?: { provider?: string; key?: string }; count?: number };

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownDatabaseError";
}

export async function inspectIntegrationSettingsDatabase(options: { staleCandidateHours?: number } = {}): Promise<IntegrationDbInspection> {
  const prisma = new PrismaClient({ log: [] });
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    const collectionsRaw = await prisma.$runCommandRaw({ listCollections: 1, filter: { name: INTEGRATION_SETTING_COLLECTION }, nameOnly: true }) as RawCursor<ListCollectionRow>;
    const collectionExists = Boolean(collectionsRaw.cursor?.firstBatch?.some((row) => row.name === INTEGRATION_SETTING_COLLECTION));
    if (!collectionExists) {
      const hello = await prisma.$runCommandRaw({ hello: 1 }) as Record<string, unknown>;
      const sessions = typeof hello.logicalSessionTimeoutMinutes === "number";
      const replicaOrMongos = typeof hello.setName === "string" || hello.msg === "isdbgrid";
      return {
        connected: true,
        collectionExists: false,
        documentCount: 0,
        duplicateKeys: [],
        indexes: [],
        indexChecks: EXPECTED_INTEGRATION_SETTING_INDEXES.map((index) => ({ id: `index:${index.name}`, status: "BLOCKED", message: `Required index is missing: ${index.name}` })),
        staleCandidates: [],
        unreadableSecrets: [],
        transactions: replicaOrMongos && sessions ? { status: "SUPPORTED", message: "Server topology advertises sessions and replica-set or mongos transaction prerequisites." } : { status: "WARNING", message: "Transaction support cannot be confirmed read-only from the advertised topology; verify on the production cluster before first live activation." },
      };
    }

    const [documentCount, rows, indexRaw, duplicateRaw, hello] = await Promise.all([
      prisma.integrationSetting.count(),
      prisma.integrationSetting.findMany({ select: { provider: true, key: true, encryptedValue: true, isSecret: true, candidateVersion: true, candidateCreatedAt: true } }),
      prisma.$runCommandRaw({ listIndexes: INTEGRATION_SETTING_COLLECTION, cursor: {} }) as Promise<RawCursor<RawIndex>>,
      prisma.$runCommandRaw({ aggregate: INTEGRATION_SETTING_COLLECTION, pipeline: [
        { $group: { _id: { provider: "$provider", key: "$key" }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
      ], cursor: {} }) as Promise<RawCursor<DuplicateRow>>,
      prisma.$runCommandRaw({ hello: 1 }) as Promise<Record<string, unknown>>,
    ]);

    const indexes = (indexRaw.cursor?.firstBatch ?? []).filter((row): row is RawIndex & { name: string; key: Record<string, number> } => Boolean(row.name && row.key)).map((row) => ({ name: row.name, key: row.key, unique: Boolean(row.unique) }));
    const duplicateKeys = (duplicateRaw.cursor?.firstBatch ?? []).map((row) => ({ provider: row._id?.provider ?? "UNKNOWN", key: row._id?.key ?? "UNKNOWN", count: Number(row.count ?? 0) }));
    const staleBefore = Date.now() - (options.staleCandidateHours ?? 24) * 60 * 60 * 1000;
    const staleCandidates = rows.filter((row) => row.key === "__PROVIDER_STATE__" && row.candidateVersion && row.candidateCreatedAt && row.candidateCreatedAt.getTime() < staleBefore).map((row) => ({ provider: row.provider, candidateVersion: row.candidateVersion, createdAt: row.candidateCreatedAt?.toISOString() ?? null }));
    const unreadableSecrets: Array<{ provider: string; key: string }> = [];
    for (const row of rows) {
      if (!row.isSecret || !row.encryptedValue) continue;
      try {
        decryptIntegrationSecret(row.encryptedValue, integrationSecretContext(row.provider, row.key));
      } catch {
        unreadableSecrets.push({ provider: row.provider, key: row.key });
      }
    }
    const sessions = typeof hello.logicalSessionTimeoutMinutes === "number";
    const replicaOrMongos = typeof hello.setName === "string" || hello.msg === "isdbgrid";
    return {
      connected: true,
      collectionExists: true,
      documentCount,
      duplicateKeys,
      indexes,
      indexChecks: inspectIndexDefinitions(indexes),
      staleCandidates,
      unreadableSecrets,
      transactions: replicaOrMongos && sessions ? { status: "SUPPORTED", message: "Server topology advertises sessions and replica-set or mongos transaction prerequisites." } : { status: "WARNING", message: "Transaction support cannot be confirmed read-only from the advertised topology; verify on the production cluster before first live activation." },
    };
  } catch (error) {
    throw new Error(`INTEGRATION_DATABASE_INSPECTION_FAILED:${safeErrorName(error)}`);
  } finally {
    await prisma.$disconnect();
  }
}
