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
