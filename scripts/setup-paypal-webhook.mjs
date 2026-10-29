import { createRequire } from "node:module";
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd(), false);
const url = "https://minberiaksa.org/api/webhooks/paypal";
if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify({ readOnly: true, url, providerCalls: 0, paymentCaptures: 0, donorMessages: 0 }));
} else {
  const { prisma } = await import("../lib/prisma.ts");
  try {
    const { ensurePayPalWebhook } = await import("../lib/paypal.ts");
    const id = await ensurePayPalWebhook(url);
    if (!id) throw new Error("PayPal did not return a webhook id");
    const current = await prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    if (current) await prisma.globalSettings.update({ where: { id: current.id }, data: { paypalWebhookId: id } });
    else await prisma.globalSettings.create({ data: { paypalWebhookId: id } });
    console.log(JSON.stringify({ configured: true, url, paymentCaptures: 0, donorMessages: 0 }));
  } finally { await prisma.$disconnect(); }
}
