// Prepare only authentication metadata. Never sends a code to a recipient.
import { createRequire } from "node:module";
import { loadReleaseModule } from "./release-metadata-runtime.mjs";
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd(), false);
const apply = process.argv.includes("--apply"), publish = process.argv.includes("--publish");
if (publish && !apply) throw new Error("Publishing requires --apply");
const name = process.env.DONOR_LOGIN_WHATSAPP_TEMPLATE || "mia_donor_login_v1";
const language = process.env.DONOR_LOGIN_WHATSAPP_LANGUAGE || "ar";
if (!apply || !publish) console.log(JSON.stringify({ readOnly: true, name, language, category: "AUTHENTICATION", recipientMessages: 0, providerCalls: 0 }));
else {
  const { prisma } = await loadReleaseModule("lib/prisma.ts");
  try {
    const { getActiveMetaWhatsappRuntimeConfig } = await loadReleaseModule("lib/communication/runtime-config.ts");
    const { listAllTemplates, ensureMetaTemplate } = await loadReleaseModule("lib/communication/providers/meta-whatsapp/templates.ts");
    const runtime = await getActiveMetaWhatsappRuntimeConfig();
    if (!runtime.configured || !runtime.values.businessAccountId) throw new Error("WHATSAPP_AUTH_NOT_CONFIGURED");
    const catalog = await listAllTemplates(null, runtime);
    const existing = catalog.ok ? catalog.templates.find(t => t.name === name && t.language === language) : null;
    if (existing?.category === "AUTHENTICATION") {
      console.log(JSON.stringify({ name, language, status: existing.status, recipientMessages: 0 }));
    } else {
      const result = await ensureMetaTemplate({ businessAccountId: runtime.values.businessAccountId, name, language, category: "AUTHENTICATION", components: [
        { type: "BODY", add_security_recommendation: true },
        { type: "FOOTER", code_expiration_minutes: 10 },
        { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: language === "ar" ? "نسخ الرمز" : "Copy code" }] },
      ] }, runtime);
      console.log(JSON.stringify({ name, language, status: result.ok ? result.status : "FAILED", reason: result.ok ? null : result.reason, recipientMessages: 0 }));
      if (!result.ok) process.exitCode = 1;
    }
  } finally { await prisma.$disconnect(); }
}
