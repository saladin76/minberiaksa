import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

export const metadataNodeFlags = ["--conditions=react-server", "--import", "tsx"];

export async function loadReleaseModule(path) {
  const loaded = await import(new URL(`../${path}`, import.meta.url).href);
  // tsx can expose a compiled CommonJS TypeScript module under default.
  return loaded.default && typeof loaded.default === "object" ? { ...loaded.default, ...loaded } : loaded;
}

/** The SSH login shell can still be Node 22 after deployment selected 24 in
 * its subshell. Select the project's engine again for standalone setup. */
export function metadataNodeExecutable(root) {
  const required = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).engines?.node;
  const major = /^(\d+)\.x$/.exec(required || "")?.[1];
  if (!major) throw new Error("Release metadata requires an exact Node.js engine in package.json");
  if (process.versions.node.split(".")[0] === major) return process.execPath;
  const candidates = [];
  for (const base of new Set([process.env.NVM_DIR, join(homedir(), ".nvm")].filter(Boolean))) {
    const versions = join(base, "versions", "node");
    if (!existsSync(versions)) continue;
    for (const version of readdirSync(versions).filter(value => value.startsWith(`v${major}.`)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) candidates.push(join(versions, version, "bin", "node"));
  }
  candidates.push("/usr/local/bin/node", "/usr/bin/node");
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const result = spawnSync(candidate, ["-p", "process.versions.node.split('.')[0]"], { encoding: "utf8", timeout: 3000 });
    if (result.status === 0 && result.stdout.trim() === major) return candidate;
  }
  throw new Error(`Release metadata requires Node.js ${required}; select it with nvm before retrying`);
}

/** Import the real setup dependencies outside Next, before any metadata
 * write. A dummy DB URL and blocked fetch prevent this check contacting any
 * production database or provider. Next's build-time aliases cannot mask a
 * missing server-only package here. */
export function checkMetadataImports(root, executable) {
  const code = `
    globalThis.fetch = () => { throw new Error("METADATA_PREFLIGHT_NETWORK_FORBIDDEN"); };
    const {loadReleaseModule} = await import("./scripts/release-metadata-runtime.mjs");
    const {prisma} = await loadReleaseModule("lib/prisma.ts");
    try {
      for (const [file, names] of [
        ["lib/communication/retired-template-policy.ts", ["retiredTemplateDisposition"]],
        ["lib/paypal.ts", ["ensurePayPalWebhook"]],
        ["lib/communication/meta-template-publisher.ts", ["publishWhatsappTemplateToMeta"]],
        ["lib/communication/notification-template-upgrade-service.ts", ["prepareNotificationUpgrades", "activateApprovedNotificationUpgrades"]],
        ["lib/certificates/manual-copy.ts", ["manualDocumentTemplate"]],
        ["lib/donations/gift-template-draft.ts", ["giftTemplateBody"]],
        ["lib/communication/greeting-template-draft.ts", ["greetingTemplateDraft", "greetingTemplateMatches"]]
      ]) {
        const loaded = await loadReleaseModule(file);
        for (const name of names) if (typeof loaded[name] !== "function") throw new Error("METADATA_EXPORT_MISSING: " + name);
      }
      console.log(JSON.stringify({runtimeImportsReady:true,node:process.versions.node,providerCalls:0,databaseWrites:0}));
    } finally { if (prisma) await prisma.$disconnect(); }
  `;
  return spawnSync(executable, [...metadataNodeFlags, "--input-type=module", "-e", code], {
    cwd: root, encoding: "utf8", timeout: 60_000,
    env: { ...process.env, DATABASE_URL: "mongodb://127.0.0.1:1/release_metadata_import_check?serverSelectionTimeoutMS=100" },
  });
}
