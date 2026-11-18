import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminSession } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { addGalleryImage, deleteGalleryImage, listGallery, reorderGallery, updateGalleryImage } from "@/lib/site-gallery/store";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
type Body = { id?: unknown; ids?: unknown; url?: unknown; visible?: unknown; captions?: unknown };
const fail = (e: unknown) => {
  const code = e instanceof Error && /^(INVALID_URL|INVALID_ID|NOTHING_TO_UPDATE)$/.test(e.message) ? e.message : "GALLERY_UNAVAILABLE";
  return reply({ error: code }, code === "GALLERY_UNAVAILABLE" ? 503 : 400);
};

async function admin() {
  const session = await getServerSession(authOptions);
  return { session, denied: requireAdminSession(session) };
}

export async function GET() {
  const { denied } = await admin();
  if (denied) return denied;
  try { return reply({ images: await listGallery() }); } catch (e) { return fail(e); }
}

export async function POST(request: NextRequest) {
  const { session, denied } = await admin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as Body;
  try {
    const image = await addGalleryImage({ url: body.url, visible: body.visible, captions: body.captions, by: session?.user?.email || "admin" });
    queueAuditLog({ ...auditActorFromDashboardSession(session!), action: "SITE_GALLERY_ADD", entityType: "SiteGalleryImage", entityId: image.id, messageAr: "إضافة صورة إلى معرض لقطات من الميدان", metadata: { visible: image.visible } });
    return reply({ image });
  } catch (e) { return fail(e); }
}

export async function PATCH(request: NextRequest) {
  const { denied } = await admin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as Body;
  try {
    if (body.ids !== undefined) await reorderGallery(body.ids);
    else await updateGalleryImage(String(body.id ?? ""), { visible: body.visible, captions: body.captions });
    return reply({ ok: true });
  } catch (e) { return fail(e); }
}

export async function DELETE(request: NextRequest) {
  const { session, denied } = await admin();
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  try {
    await deleteGalleryImage(id);
    queueAuditLog({ ...auditActorFromDashboardSession(session!), action: "SITE_GALLERY_DELETE", entityType: "SiteGalleryImage", entityId: id, messageAr: "حذف صورة من معرض لقطات من الميدان", metadata: {} });
    return reply({ ok: true });
  } catch (e) { return fail(e); }
}
