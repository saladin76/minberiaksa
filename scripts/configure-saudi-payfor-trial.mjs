// Explicit, idempotent settings change after a successful reviewed deployment.
import { createRequire } from "node:module";
import { loadReleaseModule } from "./release-metadata-runtime.mjs";
const args = process.argv.slice(2);
if (args.length !== 1 || !["--enable", "--disable", "--status"].includes(args[0])) throw new Error("Use exactly --enable, --disable or --status.");
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { prisma } = await loadReleaseModule("lib/prisma.ts");
try {
 const settings = await prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" } });
 if (!settings) throw new Error("Payment settings do not exist; nothing changed.");
 const enable = args[0] === "--enable", readOnly = args[0] === "--status";
 if (enable) {
  if (settings.payforEnabled === false) throw new Error("The PayFor master switch is disabled; nothing changed.");
  const required = ["PAYFOR_3DPAY_URL", "PAYFOR_MBR_ID", "PAYFOR_MERCHANT_ID", "PAYFOR_MERCHANT_PASS", "PAYFOR_USER_CODE", "PAYFOR_USER_PASS"];
  if (required.some(name => !process.env[name]?.trim())) throw new Error("PayFor configuration is incomplete; nothing changed.");
  const url = new URL(process.env.PAYFOR_3DPAY_URL);
  if (url.protocol !== "https:" || /^(localhost|127\.|\[::1\])/.test(url.hostname)) throw new Error("PayFor HTTPS endpoint is invalid; nothing changed.");
 }
 const changed = !readOnly && (settings.payforSaudiRoutingEnabled === true) !== enable;
 if (changed) {
  await prisma.globalSettings.update({ where: { id: settings.id }, data: { payforSaudiRoutingEnabled: enable } });
  const { writeAuditLog } = await loadReleaseModule("lib/audit-log.ts");
  await writeAuditLog({ actorRole: "SYSTEM", action: "PAYMENT_SAUDI_ROUTING_UPDATE", entityType: "GlobalSettings", entityId: settings.id, stream: "TEAM", messageAr: `توجيه السعودية إلى PayFor: ${enable ? "مفعّل" : "معطّل"} بطلب مالك الموقع`, messageEn: `Saudi PayFor routing ${enable ? "enabled" : "disabled"} by owner request`, metadata: { oldValue: settings.payforSaudiRoutingEnabled === true, newValue: enable, paymentCaptures: 0, recipientMessages: 0 } });
 }
 const check = await prisma.globalSettings.findUnique({ where: { id: settings.id }, select: { payforSaudiRoutingEnabled: true, payforEnabled: true } });
 if (!check || !readOnly && (check.payforSaudiRoutingEnabled === true) !== enable) throw new Error("Settings verification failed.");
 console.log(JSON.stringify({ readOnly, changed, enabled: check.payforSaudiRoutingEnabled === true, payforMasterEnabled: check.payforEnabled !== false, scope: "new one-time card attempts only", paymentCaptures: 0, recipientMessages: 0 }));
} finally { await prisma.$disconnect(); }
