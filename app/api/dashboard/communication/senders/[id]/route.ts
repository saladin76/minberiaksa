import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { setDefaultSender, updateSender } from "@/lib/communication/sender-service";
import { COMMUNICATION_PURPOSES } from "@/lib/communication/communication-runtime-types";
import { publicSender } from "../route";

/** Editing one sender. Channel and provider are not editable — that would silently repoint a thread. */
const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  displayName: z.string().max(120).nullable().optional(),
  phoneNumberId: z.string().max(64).nullable().optional(),
  displayPhoneNumber: z.string().max(32).nullable().optional(),
  businessAccountId: z.string().max(64).nullable().optional(),
  senderEmail: z.string().email().max(200).nullable().optional(),
  smsSender: z.string().max(32).nullable().optional(),
  supportedLocales: z.array(z.string().min(2).max(8)).max(32).optional(),
  supportedCountries: z.array(z.string().length(2)).max(64).optional(),
  supportedPurposes: z.array(z.enum(COMMUNICATION_PURPOSES)).max(4).optional(),
  status: z.enum(["ACTIVE", "DISABLED", "NEEDS_ATTENTION", "NOT_CONFIGURED"]).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(999).optional(),
  /** `true` makes this the channel's default and clears the flag on its siblings. */
  makeDefault: z.literal(true).optional(),
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
  const actor = auditActorFromDashboardSession(session!);
  const { makeDefault, ...patch } = parsed.data;

  /* Default-setting is its own service call because it must clear the flag on the channel's other
     senders in the same breath — two defaults would make routing non-deterministic. */
  if (makeDefault) {
    const promoted = await setDefaultSender(id, actor);
    if (!promoted.ok) return NextResponse.json({ error: promoted.error }, { status: promoted.status });
    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true, sender: publicSender(promoted.data) });
  }

  const result = await updateSender(id, patch, actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, sender: publicSender(result.data) });
}
