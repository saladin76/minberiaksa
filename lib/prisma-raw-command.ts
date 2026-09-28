import "server-only";

import type { Prisma } from "@prisma/client";

/**
 * A MongoDB command document, typed for `prisma.$runCommandRaw`.
 *
 * Prisma types that parameter as `Prisma.InputJsonObject`, whose values must be *plain* JSON. Real
 * commands are not: an aggregation or an update carries `Date` objects, `RegExp`, nested arrays built
 * from typed locals (`JsonMap[]`, a `$set` assembled from a model row), and operator keys that a
 * structural check cannot see through. So every one of the nineteen `$runCommandRaw` call sites in
 * this codebase was a type error — none of them wrong, all of them the same error — and they were
 * carried in the typecheck baseline instead of being explained once.
 *
 * This is that explanation, in one place: the command is assembled by us, sent straight to MongoDB,
 * and its shape is the driver's contract rather than Prisma's JSON model. Wrapping a command says
 * "this is deliberate"; a bare object literal that fails to compile still fails, which is what keeps
 * the cast from turning into a blanket exemption.
 *
 * It does NOT make the command safe. Values interpolated into a filter are still values in a query:
 * they must come from validated input, exactly as before.
 */
export function rawCommand(command: Record<string, unknown>): Prisma.InputJsonObject {
  return command as unknown as Prisma.InputJsonObject;
}

/**
 * The documents from a raw `find` or `aggregate` reply.
 *
 * Mongo nests them at `cursor.firstBatch`, and Prisma types the whole reply as opaque JSON — so every
 * caller reached in through a pair of casts and still ended up with a value TypeScript would not let
 * it iterate. This narrows once. A reply with no batch returns an empty list, which is what a `find`
 * matching nothing looks like, and non-document entries are dropped rather than trusted.
 */
export function firstBatch(reply: unknown): Record<string, unknown>[] {
  const cursor = (reply as { cursor?: unknown } | null)?.cursor;
  const batch = (cursor as { firstBatch?: unknown } | null)?.firstBatch;
  if (!Array.isArray(batch)) return [];
  return batch.filter(
    (row): row is Record<string, unknown> => typeof row === "object" && row !== null && !Array.isArray(row),
  );
}
