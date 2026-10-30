// Draft/publish provider metadata only. Never sends a greeting to a recipient.
import { createRequire } from "node:module";
import { loadReleaseModule } from "./release-metadata-runtime.mjs";
import { ensureManagedWhatsappDraft } from "./ensure-managed-whatsapp-draft.mjs";
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd(), false);
const { greetingTemplateDraft } = await loadReleaseModule("lib/communication/greeting-template-draft.ts");
const draft = greetingTemplateDraft();
const apply = process.argv.includes("--apply"), publish = process.argv.includes("--publish");
if (publish && !apply) throw new Error("Publishing requires --apply");
if (!apply) console.log(JSON.stringify({ readOnly: true, template: draft.name, languages: Object.keys(draft.translations), sender: "default-only", category: "MARKETING", providerCalls: 0, databaseWrites: 0, recipientMessages: 0 }, null, 2));
else {
  const { prisma } = await loadReleaseModule("lib/prisma.ts");
  try {
    const base = { provider: "META_WHATSAPP", channel: "WHATSAPP", kind: "CAMPAIGN", purpose: "MARKETING", category: "MARKETING", language: "ar" };
    const prepared = await ensureManagedWhatsappDraft(prisma, { draft: { ...draft, ...base }, previousDraft: { ...greetingTemplateDraft(true), ...base }, mutableLocales: ["ja", "zh"] });
    const template = prepared.template;
    if (!publish) console.log(JSON.stringify({ template: template.name, created: prepared.created, repairedLocales: prepared.repairedLocales, submitted: false, recipientMessages: 0 }));
    else {
      const { publishWhatsappTemplateToMeta } = await loadReleaseModule("lib/communication/meta-template-publisher.ts");
      const result = await publishWhatsappTemplateToMeta(template.id, { actorRole: "SYSTEM" }, { category: "MARKETING", defaultOnly: true });
      console.log(JSON.stringify({ template: template.name, created: result.created, existing: result.existing, failed: result.failed, repairedLocales: prepared.repairedLocales, languagesApproved: result.statuses.filter(row => row.status === "APPROVED").length, errors: result.errors.map(row => ({ language: row.language, reason: row.reason, detail: row.detail })), recipientMessages: 0, note: "Provider approval is required per language on the default sender. Other numbers and existing templates are unchanged." }, null, 2));
      if (!result.ok) process.exitCode = 1;
    }
  } finally { await prisma.$disconnect(); }
}
