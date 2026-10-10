import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { isCommunicationChannel } from "@/lib/communication/communication-runtime-types";
import {
  normalizeSmartAudienceDefinition,
  previewSmartAudience,
} from "@/lib/communication/smart-audience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json({ ok: false, error: "Invalid JSON object" }, { status: 400 });
    }
    body = input as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const channel = body.channel;
  if (!isCommunicationChannel(channel)) {
    return NextResponse.json(
      { ok: false, error: "channel must be EMAIL, WHATSAPP or SMS" },
      { status: 400 },
    );
  }

  try {
    const definition = normalizeSmartAudienceDefinition(body.definition ?? body, channel);
    const preview = await previewSmartAudience(definition, 50, request.signal);
    return NextResponse.json({ ok: true, definition, ...preview });
  } catch {
    return NextResponse.json(
      { ok: false, error: "تعذّر حساب الجمهور. أعد المحاولة؛ لم يتم إرجاع أعداد ناقصة أو استبعاد أي سجل بسبب خطأ القراءة." },
      { status: 503 },
    );
  }
}
