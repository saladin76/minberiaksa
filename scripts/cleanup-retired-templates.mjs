// Explicitly retired local templates only. No Meta deletion or recipient sends.
// Default is read-only. --apply writes a private backup before every mutation.
import { createRequire } from "node:module";
import { mkdir, appendFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadReleaseModule } from "./release-metadata-runtime.mjs";
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd(), false);
const apply = process.argv.includes("--apply");
const { prisma } = await loadReleaseModule("lib/prisma.ts");
const { retiredTemplateDisposition } = await loadReleaseModule("lib/communication/retired-template-policy.ts");
const backupRoot = resolve(process.env.TEMPLATE_CLEANUP_BACKUPS_DIR || join(dirname(process.cwd()), "minberi-template-cleanups"));
const backup = join(backupRoot, `${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
const results = [];
try {
  const replacements = await prisma.whatsappTemplate.findMany({ where: { name: { contains: "_notice_" } }, select: { notificationUpgrade: true } });
  const superseded = new Set(replacements.flatMap(row => {
    const marker = row.notificationUpgrade;
    return marker && typeof marker === "object" && marker.activatedAt && typeof marker.sourceId === "string" ? [marker.sourceId] : [];
  }));
  for (const [channel, model] of [["EMAIL", "emailTemplate"], ["WHATSAPP", "whatsappTemplate"]]) {
    const candidates = await prisma[model].findMany({ where: channel === "WHATSAPP" ? { OR: [{ status: "ARCHIVED" }, { id: { in: [...superseded] } }] } : { status: "ARCHIVED" }, select: { id: true } });
    for (const candidate of candidates) {
      const run = async tx => {
        const row = await tx[model].findUnique({ where: { id: candidate.id } });
        if (!row) return;
        const [triggers, campaigns, deliveries, mirror, snapshots, links] = await Promise.all([
          tx.messageTrigger.count({ where: { channel, templateId: row.id } }),
          tx.communicationCampaign.count({ where: { channel, templateGroupId: row.id } }),
          tx.communicationDelivery.count({ where: { channel, templateId: row.id } }),
          tx.sentMessage.count({ where: { channel, templateId: row.id } }),
          tx.marketingCampaignSnapshot.count({ where: { templateId: row.id } }),
          tx.communicationCampaignTrackingLink.count({ where: { templateId: row.id } }),
        ]);
        const disposition = retiredTemplateDisposition({ retired: row.status === "ARCHIVED" || superseded.has(row.id), triggers, campaigns, history: deliveries + mirror + snapshots + links });
        results.push({ channel, id: row.id, disposition, triggers, campaigns, history: deliveries + mirror + snapshots + links });
        if (!apply || disposition === "KEEP" || disposition === "ARCHIVE" && row.status === "ARCHIVED") return;
        await mkdir(backupRoot, { recursive: true, mode: 0o700 });
        const variants = channel === "WHATSAPP" ? {
          exact: await tx.whatsappTemplateWabaVariant.findMany({ where: { templateId: row.id } }),
          aggregate: await tx.whatsappTemplateVariant.findMany({ where: { templateId: row.id } }),
        } : null;
        await appendFile(backup, JSON.stringify({ channel, row, variants }) + "\n", { mode: 0o600 });
        if (disposition === "DELETE") await tx[model].delete({ where: { id: row.id } });
        else await tx[model].update({ where: { id: row.id }, data: { status: "ARCHIVED" } });
      };
      if (apply) await prisma.$transaction(run); else await run(prisma);
    }
  }
  console.log(JSON.stringify({ readOnly: !apply, recipientMessages: 0, providerCalls: 0, backup: apply ? backup : null, results }, null, 2));
} finally { await prisma.$disconnect(); }
