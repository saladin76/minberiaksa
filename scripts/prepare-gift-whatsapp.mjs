// Run after deployment: node --conditions=react-server --import tsx scripts/prepare-gift-whatsapp.mjs --apply --publish
import { createRequire } from "node:module";
import { loadReleaseModule } from "./release-metadata-runtime.mjs";
import { ensureManagedWhatsappDraft } from "./ensure-managed-whatsapp-draft.mjs";
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd(), false);
const { messagesFor } = await loadReleaseModule("i18n/locale-messages.ts");
const { SUPPORTED_LOCALES } = await loadReleaseModule("lib/locales.ts");
const { GIFT_WHATSAPP_TEMPLATE, giftTemplateBody, legacyGiftTemplateBody } = await loadReleaseModule("lib/donations/gift-template-draft.ts");
const apply = process.argv.includes("--apply"), publish = process.argv.includes("--publish");
if (publish && !apply) throw new Error("Publishing requires --apply");
const translations = Object.fromEntries(SUPPORTED_LOCALES.map(locale => [locale, { body: giftTemplateBody(messagesFor(locale).Gift, locale) }]));
if (!apply) {
  console.log(JSON.stringify({ readOnly: true, template: GIFT_WHATSAPP_TEMPLATE, languages: Object.keys(translations), sender: "default-only", providerCalls: 0 }, null, 2));
} else {
  const { prisma } = await loadReleaseModule("lib/prisma.ts");
  try {
    const draft = {
      name: GIFT_WHATSAPP_TEMPLATE, body: translations.ar.body, translations, provider: "META_WHATSAPP", channel: "WHATSAPP",
      kind: "SYSTEM", purpose: "UTILITY", category: "UTILITY", language: "ar", status: "DRAFT",
    };
    const previous = Object.fromEntries(SUPPORTED_LOCALES.map(locale => [locale, { body: legacyGiftTemplateBody(messagesFor(locale).Gift, locale) }]));
    const prepared = await ensureManagedWhatsappDraft(prisma, { draft, previousDraft: { ...draft, body: previous.ar.body, translations: previous }, mutableLocales: [...SUPPORTED_LOCALES] });
    const template = prepared.template;
    if (!publish) console.log(JSON.stringify({ templateId: template.id, template: template.name, created: prepared.created, repairedLocales: prepared.repairedLocales, submitted: false }));
    else {
      const { publishWhatsappTemplateToMeta } = await loadReleaseModule("lib/communication/meta-template-publisher.ts");
      const result = await publishWhatsappTemplateToMeta(template.id, { actorRole: "SYSTEM" }, { category: "UTILITY", defaultOnly: true });
      console.log(JSON.stringify({ templateId: template.id, template: template.name, created: result.created, existing: result.existing, failed: result.failed,
        repairedLocales: prepared.repairedLocales, languagesApproved: result.statuses.filter(row => row.status === "APPROVED").length, errors: result.errors.map(row => ({ language: row.language, reason: row.reason, detail: row.detail })),
        note: "No recipient message was sent. Meta approval is required for each language." }, null, 2));
      if (!result.ok) process.exitCode = 1;
    }
  } finally { await prisma.$disconnect(); }
}
