import type { AiConnectionRecord, AiConnectionStore } from "./connection-config";

const COLLECTION = "AiConnectionSettings";
const ID = "site-openai";
export function createAiConnectionStore(run: (command: Record<string, unknown>) => Promise<unknown>): AiConnectionStore { return {
  async read() {
    const result = await run({ find: COLLECTION, filter: { _id: ID }, limit: 1, maxTimeMS: 5000 }) as { cursor?: { firstBatch?: unknown[] } };
    if (!Array.isArray(result.cursor?.firstBatch)) throw new Error("AI_SETTINGS_UNAVAILABLE");
    return (result.cursor.firstBatch[0] as AiConnectionRecord | undefined) ?? null;
  },
  async replace(expected, value) {
    try {
      const result = await run({ findAndModify: COLLECTION, query: { _id: ID, revision: expected }, update: { $set: value }, upsert: expected === null, new: true, maxTimeMS: 5000 }) as { ok?: number; value?: { revision?: string } };
      return result.ok === 1 && result.value?.revision === value.revision;
    } catch (error) {
      if (/11000|duplicate key/i.test(error instanceof Error ? error.message : "")) return false;
      throw new Error("AI_SETTINGS_UNAVAILABLE");
    }
  },
}; }
