#!/usr/bin/env node
/**
 * A detached worktree has its own ignored /generated directory even when its
 * node_modules are linked to the production checkout for read-only QA.
 *
 * Generate ONLY the dedicated integration-settings Prisma client into this
 * worktree. Never run the default-schema generator: its @prisma/client output
 * could modify a shared node_modules symlink in a production worktree.
 *
 * Prisma "generate" reads schema metadata; it does not connect to MongoDB.
 */
import { existsSync, lstatSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const outputRoot = path.join(root, "generated");
const clientDir = path.join(outputRoot, "integration-settings-client");
if (existsSync(path.join(clientDir, "index.js")) && existsSync(path.join(clientDir, "index.d.ts"))) {
  process.exit(0);
}
if (existsSync(outputRoot) && lstatSync(outputRoot).isSymbolicLink()) {
  console.error("integration test setup: refuse to regenerate a client into a linked generated directory.");
  process.exit(2);
}

const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
if (!existsSync(prismaCli)) {
  console.error("integration test setup: prisma CLI is missing. Install project dependencies in a separate QA workspace.");
  process.exit(2);
}

console.log("integration test setup: generating the isolated integration-settings Prisma client (no database access).");
const result = spawnSync(process.execPath, [
  prismaCli,
  "generate",
  "--schema",
  "prisma/integration-settings.schema.prisma",
], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    PRISMA_GENERATE_SKIP_AUTOINSTALL: "1",
  },
});
if (result.error || result.status !== 0) {
  console.error("integration test setup: isolated Prisma generation failed.");
  process.exit(result.status || 2);
}
if (!existsSync(path.join(clientDir, "index.d.ts"))) {
  console.error("integration test setup: generated client declarations were not created.");
  process.exit(2);
}
