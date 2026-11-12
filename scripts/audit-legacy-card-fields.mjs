#!/usr/bin/env node
/**
 * Historical card-field inspection WITHOUT collecting sensitive values.
 *
 * Use ONLY after security approval, with a DB user restricted to read-only
 * commands and the explicit approved target database. No automated schedule.
 *
 * CARD_AUDIT_CONFIRM=READ_ONLY_COUNTS_APPROVED \
 * CARD_AUDIT_DATABASE=<approved_db_name> \
 * DATABASE_URL=<approved_read_only_mongodb_uri> \
 * node --import tsx scripts/audit-legacy-card-fields.mjs
 *
 * Refuses to connect without approval; sends MongoDB COUNT commands only.
 * Produces metric counts, never payment card values, credentials or donor IDs.
 */
import { PrismaClient } from "@prisma/client";
import {
  validateReadOnlyCardAuditTarget,
  runReadOnlyCardAudit,
} from "../lib/security/read-only-card-audit.ts";

try {
  validateReadOnlyCardAuditTarget(process.env);
} catch {
  console.error("Historical card audit refused: explicit target and read-only authorization required.");
  process.exitCode = 2;
}
if (process.exitCode !== 2) {
  const prisma = new PrismaClient({ log: [] });
  try {
    const counts = await runReadOnlyCardAudit(command => prisma.$runCommandRaw(command));
    console.log(JSON.stringify({ audit: "historical-card-fields", mode: "READ_ONLY_COUNTS", counts }));
  } catch {
    console.error("Historical card audit did not complete. No sensitive values are shown.");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
