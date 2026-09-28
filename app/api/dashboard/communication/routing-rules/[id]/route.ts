import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { updateRoutingRule } from "@/lib/communication/routing-rule-service";
import { COMMUNICATION_PURPOSES } from "@/lib/communication/communication-runtime-types";

/** Editing one routing rule. The channel is fixed  a rule moved between channels is a new rule. */
const patchSchema = z.object({
  locale: z.string().min(2).max(8).nullable().optional(),
  country: z.string().length(2).nullable().optional(),
  purpose: z.enum(COMMUNICATION_PURPOSES).nullable().optional(),
  senderId: z.string().min(1).optional(),
  fallbackSenderId: z.string().min(1).nullable().optional(),
  priority: z.number().int().min(0).max(999).optional(),
  enabled: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await updateRoutingRule(id, parsed.data, auditActorFromDashboardSession(session!));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, rule: result.data });
}
