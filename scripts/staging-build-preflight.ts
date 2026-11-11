/**
 * Staging-only, read-only preflight. Must pass BEFORE prisma generate/build.
 * Never touches any index, donation, payment or service.
 */
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { verifyStagingDatabase } from "../lib/staging/isolation";

async function main() {
  if (process.env.STAGING_BUILD_APPROVED !== "1") throw new Error("STAGING_BUILD_NOT_APPROVED");
  const root = process.env.STAGING_APPROVED_ROOT;
  const cwd = realpathSync(process.cwd());
  if (!root || realpathSync(root) !== cwd || cwd === "/root/minberiaksa" ||
      !/(staging|stage|[-_]qa)(\/|$)/i.test(cwd)) {
    throw new Error("STAGING_BUILD_ROOT_NOT_REVIEWED");
  }
  const actualSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", timeout: 4000 }).trim();
  if (!/^[a-f0-9]{40}$/.test(actualSha) || actualSha !== process.env.STAGING_APPROVED_SHA) {
    throw new Error("STAGING_BUILD_SHA_MISMATCH");
  }
  const db = await verifyStagingDatabase(process.env);
  // Never print the database name, host, connection string, username or role.
  console.log(JSON.stringify({ stagingPreflight: "PASS", buildSha: actualSha, identityReviewed: Boolean(db.digest), databaseWrites: 0, paymentRequests: 0 }));
}
main().catch(() => {
  console.error("STAGING_BUILD_DENIED: reviewed isolation and role verification required");
  process.exitCode = 1;
});
