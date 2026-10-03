import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { createSender, listSenders } from "@/lib/communication/sender-service";
import { listRoutingRules } from "@/lib/communication/routing-rule-service";
import { COMMUNICATION_CHANNELS, COMMUNICATION_PROVIDERS, COMMUNICATION_PURPOSES } from "@/lib/communication/communication-runtime-types";
import { getActiveCommunicationRuntimeBundle } from "@/lib/communication/runtime-config";

/**
 * Senders and routing rules, for the operator.
 *
 * `sender-service` and `routing-rule-service` have existed all along, with no endpoint and no screen:
 * the platform could route between several business numbers, but nobody could create one, so in
 * practice every message went out from the single environment default. This is the missing half.
 *
 * Provider credentials are never returned. A sender row holds identifiers (a Meta phone number id, a
 * from-address), not secrets  those live in the integration settings  but the Meta phone number id
 * is still an account-level identifier, so it is reported only as present/absent.
 */

const senderSchema = z.object({
  channel: z.enum(COMMUNICATION_CHANNELS),
  provider: z.enum(COMMUNICATION_PROVIDERS),
  name: z.string().min(1).max(120),
  displayName: z.string().max(120).nullable().optional(),
  phoneNumberId: z.string().regex(/^\d+$/).max(64).nullable().optional(),
  displayPhoneNumber: z.string().max(32).nullable().optional(),
  businessAccountId: z.string().regex(/^\d+$/).max(64).nullable().optional(),
  senderEmail: z.string().email().max(200).nullable().optional(),
  smsSender: z.string().max(32).nullable().optional(),
  supportedLocales: z.array(z.string().min(2).max(8)).max(32).optional(),
  supportedCountries: z.array(z.string().length(2)).max(64).optional(),
  supportedPurposes: z.array(z.enum(COMMUNICATION_PURPOSES)).max(4).optional(),
  status: z.enum(["ACTIVE", "DISABLED", "NEEDS_ATTENTION", "NOT_CONFIGURED"]).optional(),
  isDefault: z.boolean().optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(999).optional(),
}).superRefine((value, ctx) => {
  if (value.channel === "WHATSAPP") {
    if (value.provider !== "META_WHATSAPP") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["provider"], message: "WhatsApp sender must use META_WHATSAPP." });
    }
    if (!value.phoneNumberId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phoneNumberId"], message: "Phone Number ID is required for WhatsApp." });
    }
    if (!value.businessAccountId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["businessAccountId"], message: "WABA ID is required for WhatsApp." });
    }
    if (!value.displayPhoneNumber) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["displayPhoneNumber"], message: "Display phone number is required for WhatsApp." });
    }
  }
});

/** What the client is allowed to see about one sender. */
export function publicSender(row: Awaited<ReturnType<typeof listSenders>>[number]) {
  return {
    id: row.id,
    channel: row.channel,
    provider: row.provider,
    name: row.name,
    displayName: row.displayName,
    /* The number as a human reads it is safe to show; the Meta id behind it is not. */
    displayPhoneNumber: row.displayPhoneNumber,
    hasPhoneNumberId: Boolean(row.phoneNumberId),
    senderEmail: row.senderEmail,
    smsSender: row.smsSender,
    supportedLocales: row.supportedLocales,
    supportedCountries: row.supportedCountries,
    supportedPurposes: row.supportedPurposes,
    status: row.status,
    qualityRating: row.qualityRating,
    isDefault: row.isDefault,
    enabled: row.enabled,
    priority: row.priority,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const [senders, rules, runtime] = await Promise.all([
    listSenders(),
    listRoutingRules(),
    getActiveCommunicationRuntimeBundle(),
  ]);

  /* The environment defaults are shown because they are what serves a channel with no sender rows 
     the one case the resolver still falls back to them. Presence only, never the values. */
  const environmentDefaults = {
    WHATSAPP: runtime.meta.configured && Boolean(runtime.meta.values.defaultPhoneNumberId),
    EMAIL: runtime.elasticEmail.configured && Boolean(runtime.elasticEmail.values.senderEmail),
    SMS: runtime.netgsm.configured || runtime.brevoSms.configured,
  };

  return NextResponse.json({
    ok: true,
    senders: senders.map(publicSender),
    rules: rules.map((rule) => ({
      id: rule.id,
      channel: rule.channel,
      locale: rule.locale,
      country: rule.country,
      purpose: rule.purpose,
      senderId: rule.senderId,
      fallbackSenderId: rule.fallbackSenderId,
      priority: rule.priority,
      enabled: rule.enabled,
      notes: rule.notes,
    })),
    environmentDefaults,
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = senderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createSender(parsed.data, auditActorFromDashboardSession(session!));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, sender: publicSender(result.data) });
}
