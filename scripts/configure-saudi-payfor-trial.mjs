// Explicit, idempotent settings change. Never captures payments or sends messages.
import { createRequire } from "node:module";
import { ensureSettingsCommandRuntime } from "./settings-command-runtime.mjs";
import { configureSaudiRouting } from "./settings-command-service.mjs";
import { loadReleaseModule } from "./release-metadata-runtime.mjs";
const args = process.argv.slice(2);
if (args.length !== 1 || !["--enable", "--disable", "--status"].includes(args[0])) throw new Error("Use exactly --enable, --disable or --status.");
ensureSettingsCommandRuntime(import.meta.url);
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { prisma } = await loadReleaseModule("lib/prisma.ts");
try { console.log(JSON.stringify(await configureSaudiRouting(prisma, args[0]))); }
finally { await prisma.$disconnect(); }
