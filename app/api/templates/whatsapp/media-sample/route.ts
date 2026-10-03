import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { uploadMetaTemplateSample } from "@/lib/communication/providers/meta-whatsapp/templates";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "اختر ملفًا صالحًا." }, { status: 400 });
  if (!file.size || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "حجم عينة القالب يجب ألا يتجاوز 25MB." }, { status: 413 });
  }

  const result = await uploadMetaTemplateSample({
    bytes: new Uint8Array(await file.arrayBuffer()),
    name: file.name,
    type: file.type,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "تعذر رفع عينة الوسائط إلى Meta.", reason: result.reason, detail: result.detail },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, handle: result.handle });
}
