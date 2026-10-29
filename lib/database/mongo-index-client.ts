import { MongoClient } from "mongodb";

export type IndexCommandClient = {
  $runCommandRaw(command: Record<string, unknown>): Promise<Record<string, unknown>>;
  $disconnect(): Promise<void>;
};

/** Schema metadata can contain Mongo's {$type: "string"}. Prisma 6 treats
 * that value as a protocol tag and throws "Unknown tagged value". Keep index
 * commands on the native Mongo driver, without rewriting provider metadata. */
export async function createMongoIndexClient(): Promise<IndexCommandClient> {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL is required for index setup");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  await client.connect();
  const db = client.db();
  return {
    $runCommandRaw: command => db.command(command),
    $disconnect: () => client.close(),
  };
}
