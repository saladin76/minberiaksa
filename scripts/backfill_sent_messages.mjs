/**
 * Best-effort import of historical sends into the SentMessage log.
 *
 * The legacy audit log only records summary counts (sent/failed/skipped), so
 * backfill rows have origin=BACKFILL, no rendered content, and a synthetic
 * templateName parsed from the messageAr field. Re-running this script is
 * safe — it deletes prior BACKFILL rows before re-inserting.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Parse "أرسل قالب بريد «X» — نجح 1 / تخطّي 0 / فشل 0" → X
function parseTemplateName(messageAr) {
  if (typeof messageAr !== "string") return null;
  const m = messageAr.match(/«([^»]+)»/);
  return m ? m[1].trim() : null;
}

async function run() {
  const deleted = await prisma.sentMessage.deleteMany({ where: { origin: "BACKFILL" } });
  console.log(`Deleted ${deleted.count} prior BACKFILL rows.`);

  const audits = await prisma.auditLog.findMany({
    where: {
      action: { in: ["EMAIL_TEMPLATE_SEND", "WHATSAPP_TEMPLATE_SEND", "EVENT_DISPATCH"] },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Found ${audits.length} audit log rows to import.`);

  let created = 0;
  for (const a of audits) {
    const meta = a.metadata ?? {};
    if (a.action === "EMAIL_TEMPLATE_SEND" || a.action === "WHATSAPP_TEMPLATE_SEND") {
      const channel = a.action === "EMAIL_TEMPLATE_SEND" ? "EMAIL" : "WHATSAPP";
      const total = Number(meta.total ?? 0);
      const sent = Number(meta.sent ?? 0);
      const failed = Number(meta.failed ?? 0);
      const skipped = Number(meta.skipped ?? 0);
      const status = failed > 0 && sent === 0 ? "FAILED" : skipped > 0 && sent === 0 ? "SKIPPED" : "SENT";
      await prisma.sentMessage.create({
        data: {
          channel,
          origin: "BACKFILL",
          status,
          templateId: a.entityId ?? null,
          templateName: parseTemplateName(a.messageAr) ?? "(غير معروف)",
          locale: typeof meta.localeOverride === "string" ? meta.localeOverride : "ar",
          renderedBody: "",
          actorId: a.actorId,
          actorName: a.actorName,
          backfillTotal: total,
          backfillSent: sent,
          backfillFailed: failed,
          backfillSkipped: skipped,
          createdAt: a.createdAt,
        },
      });
      created += 1;
    } else if (a.action === "EVENT_DISPATCH") {
      const event = typeof meta.event === "string" ? meta.event : null;
      const emailsSent = Number(meta.emailsSent ?? 0);
      const whatsappSent = Number(meta.whatsappSent ?? 0);
      const errors = Number(meta.errors ?? 0);
      const donationId = typeof meta.donationId === "string" ? meta.donationId : null;

      const validTriggerEvents = new Set([
        "DONATION_PAID",
        "DONATION_FAILED",
        "FIRST_DONATION",
        "USER_REGISTERED",
        "SUBSCRIPTION_CREATED",
        "SUBSCRIPTION_PAYMENT",
        "SUBSCRIPTION_CANCELLED",
      ]);
      const triggerEvent = event && validTriggerEvents.has(event) ? event : null;

      if (emailsSent > 0) {
        await prisma.sentMessage.create({
          data: {
            channel: "EMAIL",
            origin: "BACKFILL",
            status: "SENT",
            templateId: null,
            templateName: event ?? "(تلقائي)",
            triggerEvent,
            locale: "ar",
            renderedBody: "",
            donationId,
            backfillTotal: emailsSent,
            backfillSent: emailsSent,
            backfillFailed: 0,
            backfillSkipped: 0,
            createdAt: a.createdAt,
          },
        });
        created += 1;
      }
      if (whatsappSent > 0) {
        await prisma.sentMessage.create({
          data: {
            channel: "WHATSAPP",
            origin: "BACKFILL",
            status: "SENT",
            templateId: null,
            templateName: event ?? "(تلقائي)",
            triggerEvent,
            locale: "ar",
            renderedBody: "",
            donationId,
            backfillTotal: whatsappSent,
            backfillSent: whatsappSent,
            backfillFailed: 0,
            backfillSkipped: 0,
            createdAt: a.createdAt,
          },
        });
        created += 1;
      }
      // If both counts are 0 but errors exist, still record a FAILED summary row.
      if (emailsSent === 0 && whatsappSent === 0 && errors > 0) {
        await prisma.sentMessage.create({
          data: {
            channel: "EMAIL",
            origin: "BACKFILL",
            status: "FAILED",
            templateId: null,
            templateName: event ?? "(تلقائي)",
            triggerEvent,
            locale: "ar",
            renderedBody: "",
            donationId,
            backfillTotal: 0,
            backfillSent: 0,
            backfillFailed: errors,
            backfillSkipped: 0,
            createdAt: a.createdAt,
          },
        });
        created += 1;
      }
    }
  }

  console.log(`Created ${created} BACKFILL rows.`);
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
