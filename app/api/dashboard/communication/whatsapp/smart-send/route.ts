import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { getSmartWhatsappContext, sendSmartWhatsapp } from "@/lib/communication/smart-whatsapp-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sendSchema = z.object({
  userId: z.string().min(1),
  mode: z.enum(["AUTO", "FREEFORM", "UTILITY", "MARKETING"]),
  body: z.string().max(4096).nullable().optional(),
  templateId: z.string().min(1).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });

  const context = await getSmartWhatsappContext(userId);
  if (!context) return NextResponse.json({ ok: false, error: "Donor not found" }, { status: 404 });
  return NextResponse.json({ ok: true, context });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await sendSmartWhatsapp({
    ...parsed.data,
    actor: auditActorFromDashboardSession(session!),
  });
  if (!result.ok) {
    const status =
      result.reason === "REPLY_WINDOW_CLOSED" ? 409
      : result.reason === "DO_NOT_CONTACT" ? 403
      : result.reason.includes("NOT_FOUND") ? 404
      : 422;
    return NextResponse.json({ ok: false, error: result.reason, detail: result.detail ?? null }, { status });
  }
  return NextResponse.json({ ok: true, result });
}
