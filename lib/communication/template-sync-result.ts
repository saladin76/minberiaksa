// Legacy sync audits also include single-template/WABA refreshes, so they cannot
// establish that the complete catalogue was synchronized.
export const WHATSAPP_CATALOGUE_SYNC_ACTION = "communication.whatsapp.templates.catalogue.sync";

export type TemplateSyncResult = {
  completedAt: string;
  variantsUpserted: number;
  matchedTemplates: number;
  unmatchedNames: string[];
};

/** Expose only completed catalogue counts/names, never arbitrary audit metadata. */
export function templateSyncResult(record: { createdAt: Date | string; metadata: unknown } | null | undefined): TemplateSyncResult | null {
  if (!record || !record.metadata || typeof record.metadata !== "object" || Array.isArray(record.metadata)) return null;
  const meta = record.metadata as Record<string, unknown>;
  const timestamp = new Date(record.createdAt).getTime();
  const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (meta.ok !== true || !Number.isFinite(timestamp) || !count(meta.variantsUpserted) || !count(meta.matchedTemplates) || !Array.isArray(meta.unmatchedNames)) return null;
  if (meta.unmatchedNames.some(name => typeof name !== "string" || !name.trim() || name.length > 512)) return null;
  return { completedAt: new Date(timestamp).toISOString(), variantsUpserted: meta.variantsUpserted, matchedTemplates: meta.matchedTemplates, unmatchedNames: [...new Set(meta.unmatchedNames as string[])].slice(0, 1000) };
}
