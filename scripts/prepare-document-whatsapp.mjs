import { createRequire } from "node:module";
import { loadReleaseModule } from "./release-metadata-runtime.mjs";
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd(), false);
const { SUPPORTED_LOCALES } = await loadReleaseModule("lib/locales.ts");
const { manualDocumentTemplate, MANUAL_DOCUMENT_TEMPLATE } = await loadReleaseModule("lib/certificates/manual-copy.ts");
const apply = process.argv.includes("--apply"), publish = process.argv.includes("--publish");
if (publish && !apply) throw new Error("Publishing requires --apply");
if (!apply) console.log(JSON.stringify({ readOnly: true, template: MANUAL_DOCUMENT_TEMPLATE, languages: [...SUPPORTED_LOCALES], sender: "default-only", recipientMessages: 0 }));
else {
  const { prisma } = await loadReleaseModule("lib/prisma.ts");
  try {
    const translations = Object.fromEntries(SUPPORTED_LOCALES.map(locale => [locale, { body: manualDocumentTemplate(locale) }]));
    const existing = await prisma.whatsappTemplate.findFirst({ where: { name: MANUAL_DOCUMENT_TEMPLATE } });
    const template = existing || await prisma.whatsappTemplate.create({ data: { name: MANUAL_DOCUMENT_TEMPLATE, body: translations.ar.body, translations, provider: "META_WHATSAPP", channel: "WHATSAPP", kind: "SYSTEM", category: "UTILITY", purpose: "UTILITY", language: "ar", status: "DRAFT" } });
    if (publish) {
      const { publishWhatsappTemplateToMeta } = await loadReleaseModule("lib/communication/meta-template-publisher.ts");
      const result = await publishWhatsappTemplateToMeta(template.id, { actorRole: "SYSTEM" }, { defaultOnly: true });
      console.log(JSON.stringify({ ok: result.ok, created: result.created, existing: result.existing, failed: result.failed, approved: result.statuses.filter(row => row.status === "APPROVED").length, errors: result.errors.map(row => ({ language: row.language, reason: row.reason })), recipientMessages: 0 }));
      if (!result.ok) process.exitCode = 1;
    } else console.log(JSON.stringify({ created: !existing, submitted: false, recipientMessages: 0 }));
  } finally { await prisma.$disconnect(); }
}
