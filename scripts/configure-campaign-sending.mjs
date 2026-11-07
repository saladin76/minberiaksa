// Explicit maintenance command. No campaign execution or recipient sends.
import { createRequire } from "node:module";
import { ensureSettingsCommandRuntime } from "./settings-command-runtime.mjs";
import { configureCampaignInterval } from "./settings-command-service.mjs";
import { loadReleaseModule } from "./release-metadata-runtime.mjs";
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--apply" && !/^--whatsapp-cooldown-days=\d+$/.test(arg))) throw new Error("Unknown sending configuration option.");
const choices = args.filter(arg => arg.startsWith("--whatsapp-cooldown-days="));
if (choices.length !== 1 || args.filter(arg => arg === "--apply").length > 1) throw new Error("Pass one --whatsapp-cooldown-days value and at most one --apply.");
const days = Number(choices[0].split("=")[1]);
if (!Number.isInteger(days) || days < 0 || days > 365) throw new Error("The interval must be an integer from 0 to 365.");
ensureSettingsCommandRuntime(import.meta.url);
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { prisma } = await loadReleaseModule("lib/prisma.ts");
try { console.log(JSON.stringify(await configureCampaignInterval(prisma, days, args.includes("--apply")), null, 2)); }
finally { await prisma.$disconnect(); }
