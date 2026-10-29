// Draft/publish provider metadata only. Never sends a greeting to a recipient.
import { createRequire } from "node:module";
import { loadReleaseModule } from "./release-metadata-runtime.mjs";
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd(), false);
const { greetingTemplateDraft, greetingTemplateMatches } = await loadReleaseModule("lib/communication/greeting-template-draft.ts");
const draft = greetingTemplateDraft();
const apply = process.argv.includes("--apply"), publish = process.argv.includes("--publish");
if (publish && !apply) throw new Error("Publishing requires --apply");
if (!apply) console.log(JSON.stringify({ readOnly: true, template: draft.name, languages: Object.keys(draft.translations), sender: "default-only", category: "MARKETING", providerCalls: 0, databaseWrites: 0, recipientMessages: 0 }, null, 2));
else {
  const { prisma } = await loadReleaseModule("lib/prisma.ts");
  try {
    const existing = await prisma.whatsappTemplate.findFirst({ where: { name: draft.name } });
    if (existing?.status === "ARCHIVED") throw new Error("GREETING_TEMPLATE_ARCHIVED: the operator's archived template will not be republished automatically.");
    // A manually changed/submitted template is never silently overwritten.
    if (existing && !greetingTemplateMatches(existing)) throw new Error("GREETING_DRAFT_CHANGED: review the existing template before publication.");
    const template = existing || await prisma.whatsappTemplate.create({ data: {
      ...draft, provider: "META_WHATSAPP", channel: "WHATSAPP", kind: "CAMPAIGN", purpose: "MARKETING", category: "MARKETING", language: "ar", status: "DRAFT",
    } });
    if (!publish) console.log(JSON.stringify({ template: template.name, created: !existing, submitted: false, recipientMessages: 0 }));
    else {
      const { publishWhatsappTemplateToMeta } = await loadReleaseModule("lib/communication/meta-template-publisher.ts");
      const result = await publishWhatsappTemplateToMeta(template.id, { actorRole: "SYSTEM" }, { category: "MARKETING", defaultOnly: true });
      console.log(JSON.stringify({ template: template.name, created: result.created, existing: result.existing, failed: result.failed, languagesApproved: result.statuses.filter(row => row.status === "APPROVED").length, errors: result.errors.map(row => ({ language: row.language, reason: row.reason })), recipientMessages: 0, note: "Provider approval is required per language on the default sender. Other numbers and existing templates are unchanged." }, null, 2));
      if (!result.ok) process.exitCode = 1;
    }
  } finally { await prisma.$disconnect(); }
}
