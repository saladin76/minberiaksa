// Explicit maintenance command. No campaign execution or recipient sends.
import { createRequire } from "node:module";
import { loadReleaseModule } from "./release-metadata-runtime.mjs";
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--apply" && !/^--whatsapp-cooldown-days=\d+$/.test(arg))) throw new Error("Unknown sending configuration option.");
const choices = args.filter(arg => arg.startsWith("--whatsapp-cooldown-days="));
if (choices.length !== 1) throw new Error("Pass --whatsapp-cooldown-days=0 to remove the interval, or a day count up to 365.");
const days = Number(choices[0].split("=")[1]), apply = args.includes("--apply");
if (!Number.isInteger(days) || days < 0 || days > 365) throw new Error("The interval must be an integer from 0 to 365.");
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { prisma } = await loadReleaseModule("lib/prisma.ts");
try {
  const { readCampaignGlobalControls, setCampaignGlobalControls } = await loadReleaseModule("lib/communication/campaign-send-controls.ts");
  const current = await readCampaignGlobalControls();
  if (!current.ok) throw new Error("Sending settings are unavailable; nothing was changed.");
  let saved = current.controls, changed = false;
  if (apply && current.controls.whatsappMarketingCooldownDays !== days) {
    const updated = await setCampaignGlobalControls({ whatsappMarketingCooldownDays: days }, null);
    if (!updated) throw new Error("Sending interval could not be saved.");
    saved = updated; changed = true;
    const { writeAuditLog } = await loadReleaseModule("lib/audit-log.ts");
    await writeAuditLog({ actorRole: "SYSTEM", action: "communication.campaign.whatsapp-marketing-cooldown.updated", entityType: "CommunicationGlobalControl", entityId: "global", messageAr: `تم ضبط الفاصل بين الرسائل التسويقية عبر واتساب إلى ${days} يومًا`, messageEn: `WhatsApp marketing interval set to ${days} days`, metadata: { whatsappMarketingCooldownDays: days, externalCall: false }, stream: "TEAM" });
  }
  const check = await readCampaignGlobalControls();
  if (!check.ok || apply && check.controls.whatsappMarketingCooldownDays !== days || check.ok && check.controls.emergencyStop !== current.controls.emergencyStop) throw new Error("Sending settings verification failed; inspect before retrying.");
  console.log(JSON.stringify({ readOnly: !apply, changed, current: saved, requestedWhatsappCooldownDays: days, recipientMessages: 0, providerCalls: 0, paymentCalls: 0 }, null, 2));
} finally { await prisma.$disconnect(); }
