import type { PrismaClient } from "@prisma/client";

type Index = { name: string; key?: Record<string, number>; unique?: boolean; sparse?: boolean; partialFilterExpression?: unknown; collation?: unknown };
const name = "User_email_string_unique";
const filter = { email: { $type: "string" } };
/** Preserve real-email uniqueness while allowing multiple donors without an email.
 * Build and verify the replacement before dropping a recognized legacy index.
 * Never alter a custom filter or collation automatically.
 */
export async function ensureOptionalUserEmailIndex(db: Pick<PrismaClient, "$runCommandRaw">, checkOnly = false) {
  const read = async () => {
    const result = await db.$runCommandRaw({ listIndexes: "User" });
    return (result.cursor as { firstBatch?: Index[] })?.firstBatch ?? [];
  };
  const indexes = await read();
  const emailIndexes = indexes.filter(index => JSON.stringify(index.key) === JSON.stringify({ email: 1 }) && index.unique);
  const correct = (index: Index) => !index.collation && !index.sparse && JSON.stringify(index.partialFilterExpression) === JSON.stringify(filter);
  const legacy = emailIndexes.filter(index => !correct(index));
  if (legacy.some(index => !["User_email_key", "email_1"].includes(index.name) || index.collation || index.partialFilterExpression || index.sparse)) throw new Error("USER_EMAIL_CUSTOM_INDEX_REQUIRES_REVIEW");
  if (checkOnly) return emailIndexes.some(correct) && legacy.length === 0;
  if (!emailIndexes.some(correct)) {
    await db.$runCommandRaw({ createIndexes: "User", indexes: [{ name, key: { email: 1 }, unique: true, partialFilterExpression: filter }] });
    if (!(await read()).some(correct)) throw new Error("USER_EMAIL_REPLACEMENT_NOT_VERIFIED");
  }
  for (const index of legacy) await db.$runCommandRaw({ dropIndexes: "User", index: index.name });
  return true;
}
