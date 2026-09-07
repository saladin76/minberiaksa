import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { createOperationTaskInRepository } from "../tasks/task-repository";
import type {
  DonorReactivationActionType,
  DonorReactivationCandidate,
  DonorReactivationChannel,
  DonorReactivationMutationResult,
  DonorReactivationOverview,
} from "./donor-reactivation-types";
import type { Session } from "next-auth";

const actionByType: Record<DonorReactivationActionType, string> = {
  MARK_MANUALLY_SENT: "operations.donor-reactivation.manual-sent",
  SKIP_THIS_MONTH: "operations.donor-reactivation.skip-this-month",
  DISMISS: "operations.donor-reactivation.dismiss",
  ASSIGN_FOLLOW_UP_TASK: "operations.donor-reactivation.assign-follow-up-task",
};

const auditActions = Object.values(actionByType);

const dayMs = 24 * 60 * 60 * 1000;

function fallbackPersistence(note: string): DonorReactivationOverview["persistence"] {
  return {
    mode: "foundation",
    storage: "computed-engine",
    readOnly: true,
    model: "DonorReactivationCandidate",
    nextModel: "DonorReactivationReminder",
    readyForDb: true,
    externalSideEffects: false,
    note,
  };
}

function prismaPersistence(count: number): DonorReactivationOverview["persistence"] {
  return {
    mode: "prisma",
    storage: "prisma",
    readOnly: false,
    model: "Donation + User + AuditLog",
    nextModel: "DonorReactivationReminder",
    readyForDb: true,
    externalSideEffects: false,
    note: `${count} donor reactivation candidate(s) are calculated from paid donations and recent manual reactivation audit logs. No messages are sent automatically.`,
  };
}

function foundationOverview(note: string): DonorReactivationOverview {
  const generatedAt = new Date().toISOString();
  return {
    source: "donor-reactivation-foundation",
    generatedAt,
    persistence: fallbackPersistence(note),
    safety: {
      noAutoSend: true,
      manualOnly: true,
      noExternalCalls: true,
      noAiGeneration: true,
    },
    summary: {
      candidates: 0,
      whatsappOrSms: 0,
      email: 0,
      noChannel: 0,
      recentlyHandled: 0,
    },
    candidates: [],
    recentlyHandledDonorIds: [],
  };
}

function donationMoment(donation: { paidAt: Date | null; createdAt: Date }) {
  return donation.paidAt ?? donation.createdAt;
}

function daysSince(value: Date) {
  return Math.max(0, Math.floor((Date.now() - value.getTime()) / dayMs));
}

function donorName(donor: { name: string | null; email: string | null; phone: string | null }) {
  return donor.name || donor.email || donor.phone || "متبرع بدون اسم";
}

function donorLocale(donationLocale: string | null, preferredLang: string | null) {
  return preferredLang || donationLocale || "ar";
}

function donorChannel(donor: { phone: string | null; email: string | null; smsNotifications: boolean; emailNotifications: boolean }): DonorReactivationChannel {
  if (donor.phone && donor.smsNotifications) return "WHATSAPP_OR_SMS";
  if (donor.email && donor.emailNotifications) return "EMAIL";
  return "NO_CHANNEL";
}

function suggestedMessage(channel: DonorReactivationChannel) {
  if (channel === "EMAIL") return "استخدم قالب Email donor reactivation، ثم راجع النص يدويًا قبل الإرسال.";
  if (channel === "WHATSAPP_OR_SMS") return "استخدم WhatsApp/SMS حسب provider المتاح، ثم أكد الإرسال يدويًا فقط.";
  return "لا يوجد channel مناسب؛ أنشئ مهمة متابعة داخل الفريق بدل الإرسال.";
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function recentHandledDonorIds(since: Date) {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: { in: auditActions },
      entityType: "DonorReactivationReminder",
      createdAt: { gte: since },
    },
    select: { entityId: true, metadata: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return [...new Set(rows.map((row) => stringField(metadataObject(row.metadata).donorId) ?? row.entityId).filter((value): value is string => Boolean(value)))];
}

export async function getDonorReactivationOverview(): Promise<DonorReactivationOverview> {
  if (!process.env.DATABASE_URL) {
    return foundationOverview("DATABASE_URL is not configured; donor reactivation remains manual foundation only.");
  }

  const cutoff = new Date(Date.now() - 30 * dayMs);

  try {
    const [donations, handledIds] = await Promise.all([
      prisma.donation.findMany({
        where: { status: "PAID" },
        include: {
          donor: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              preferredLang: true,
              emailNotifications: true,
              smsNotifications: true,
              countryCode: true,
              countryName: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 1000,
      }),
      recentHandledDonorIds(cutoff),
    ]);

    const handled = new Set(handledIds);
    const latestByDonor = new Map<string, (typeof donations)[number]>();
    for (const donation of donations) {
      if (!latestByDonor.has(donation.donorId)) latestByDonor.set(donation.donorId, donation);
    }

    let noChannel = 0;
    const candidates: DonorReactivationCandidate[] = [];

    for (const donation of latestByDonor.values()) {
      const lastDonationAt = donationMoment(donation);
      if (lastDonationAt > cutoff) continue;
      if (handled.has(donation.donorId)) continue;

      const channel = donorChannel(donation.donor);
      if (channel === "NO_CHANNEL") noChannel += 1;
      if (channel === "NO_CHANNEL") continue;

      candidates.push({
        donorId: donation.donorId,
        donorName: donorName(donation.donor),
        donorEmail: donation.donor.email,
        donorPhone: donation.donor.phone,
        locale: donorLocale(donation.locale, donation.donor.preferredLang),
        channel,
        country: donation.donor.countryName ?? donation.donor.countryCode ?? null,
        lastDonationId: donation.id,
        lastDonationAt: lastDonationAt.toISOString(),
        daysSinceLastDonation: daysSince(lastDonationAt),
        lastDonationAmount: donation.amountUSD ?? donation.amount,
        lastDonationCurrency: donation.amountUSD ? "USD" : donation.currency,
        suggestedMessage: suggestedMessage(channel),
        reason: "Last paid donation is 30+ days old, no newer paid donation was found, and no recent donor reactivation manual marker exists.",
      });
    }

    candidates.sort((a, b) => b.daysSinceLastDonation - a.daysSinceLastDonation);

    return {
      source: "donor-reactivation-donation-db",
      generatedAt: new Date().toISOString(),
      persistence: prismaPersistence(candidates.length),
      safety: {
        noAutoSend: true,
        manualOnly: true,
        noExternalCalls: true,
        noAiGeneration: true,
      },
      summary: {
        candidates: candidates.length,
        whatsappOrSms: candidates.filter((candidate) => candidate.channel === "WHATSAPP_OR_SMS").length,
        email: candidates.filter((candidate) => candidate.channel === "EMAIL").length,
        noChannel,
        recentlyHandled: handledIds.length,
      },
      candidates,
      recentlyHandledDonorIds: handledIds,
    };
  } catch (error) {
    console.error("Donor reactivation overview failed", error);
    return foundationOverview("Donor reactivation DB read failed; using safe foundation mode.");
  }
}

function actionMessage(action: DonorReactivationActionType) {
  if (action === "MARK_MANUALLY_SENT") return "تم تسجيل التواصل اليدوي";
  if (action === "SKIP_THIS_MONTH") return "تم تخطي المتبرع لهذا الشهر";
  if (action === "DISMISS") return "تم استبعاد المتبرع من هذه القائمة";
  return "تم إنشاء مهمة متابعة للمتبرع";
}

export async function runDonorReactivationAction(
  donorId: string,
  action: DonorReactivationActionType,
  note: string | null | undefined,
  session: Session,
): Promise<DonorReactivationMutationResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, mode: "foundation", status: 503, message: "DATABASE_URL is not configured; no reactivation marker was saved." };
  }

  const actor = auditActorFromDashboardSession(session);
  const overview = await getDonorReactivationOverview();
  const candidate = overview.candidates.find((item) => item.donorId === donorId) ?? null;

  if (!candidate) {
    return { ok: false, mode: "prisma", status: 404, message: "Donor reactivation candidate not found or already handled." };
  }

  let taskId: string | undefined;

  if (action === "ASSIGN_FOLLOW_UP_TASK") {
    const taskResult = await createOperationTaskInRepository(
      {
        title: `متابعة تنشيط متبرع: ${candidate.donorName}`,
        description: [
          "مهمة متابعة Donor Reactivation بدون إرسال تلقائي.",
          `المتبرع: ${candidate.donorName}`,
          `القناة المقترحة: ${candidate.channel}`,
          `آخر تبرع: ${candidate.lastDonationAmount} ${candidate.lastDonationCurrency}`,
          `منذ: ${candidate.daysSinceLastDonation} يوم`,
          note ? `ملاحظة: ${note}` : null,
        ].filter(Boolean).join(" "),
        taskType: "MESSAGING",
        priority: candidate.daysSinceLastDonation >= 90 ? "HIGH" : "MEDIUM",
        sourceType: "DONOR_REACTIVATION",
      },
      actor.actorId,
    );

    if (!taskResult.ok) {
      return { ok: false, mode: taskResult.mode, status: 503, message: taskResult.message, action };
    }

    taskId = taskResult.task?.id;
  }

  await writeAuditLog({
    ...actor,
    action: actionByType[action],
    messageAr: actionMessage(action),
    messageEn: `Donor reactivation action: ${action}`,
    entityType: "DonorReactivationReminder",
    entityId: donorId,
    metadata: {
      donorId,
      donorName: candidate.donorName,
      channel: candidate.channel,
      lastDonationId: candidate.lastDonationId,
      lastDonationAt: candidate.lastDonationAt,
      note: note ?? null,
      taskId: taskId ?? null,
      externalSideEffects: false,
      autoSend: false,
      manualOnly: true,
    },
    stream: "TEAM",
  });

  return { ok: true, mode: "prisma", status: 200, message: actionMessage(action), action, taskId };
}
