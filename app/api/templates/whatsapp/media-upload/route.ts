import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { uploadMetaTemplateSample } from "@/lib/communication/providers/meta-whatsapp/templates";
import { discardPublicTemplateMedia, storePublicTemplateMedia, templateMediaStorageConfigured } from "@/lib/communication/whatsapp-template-media-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITS: Record<string, number> = {
  "image/jpeg": 5 * 1024 * 1024,
  "image/png": 5 * 1024 * 1024,
  "video/mp4": 16 * 1024 * 1024,
  "application/pdf": 100 * 1024 * 1024,
};
function mediaMime(file: File): string | null {
  const type = file.type.toLowerCase();
  if (type === "application/x-pdf" || (type === "application/octet-stream" && /\.pdf$/i.test(file.name))) return "application/pdf";
  return Object.prototype.hasOwnProperty.call(LIMITS, type) ? type : null;
}
function hasExpectedHeader(bytes: Buffer, mime: string): boolean {
  if (mime === "application/pdf") return bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"));
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "video/mp4") return bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp";
  return false;
}
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;
  if (!templateMediaStorageConfigured()) {
    return NextResponse.json({ error: "VPS template-media storage is not configured.", reason: "TEMPLATE_MEDIA_LOCAL_STORAGE_DISABLED" }, { status: 503 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "اختر ملفًا صالحًا." }, { status: 400 });
  const mime = mediaMime(file);
  if (!mime || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > LIMITS[mime]) {
    return NextResponse.json({ error: "نوع الملف أو حجمه غير مدعوم. JPG/PNG 5MB، MP4 16MB، PDF 100MB." }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!hasExpectedHeader(bytes, mime)) {
    return NextResponse.json({ error: "محتوى الملف لا يطابق نوع الوسائط." }, { status: 400 });
  }

  let stored: Awaited<ReturnType<typeof storePublicTemplateMedia>>;
  try { stored = await storePublicTemplateMedia(bytes, mime); }
  catch {
    return NextResponse.json({ error: "تعذر حفظ الملف في مساحة وسائط واتساب الدائمة على VPS.", reason: "MEDIA_STORAGE_FAILED" }, { status: 503 });
  }
  try {
    const uploaded = await uploadMetaTemplateSample({ bytes: new Uint8Array(bytes), name: file.name, type: mime });
    if (!uploaded.ok) {
      await discardPublicTemplateMedia(stored.publicId);
      return NextResponse.json({ error: "تعذر رفع عينة الوسائط إلى Meta.", reason: uploaded.reason, detail: uploaded.detail }, { status: 502 });
    }
    return NextResponse.json({ ok: true, handle: uploaded.handle, url: stored.url, publicId: stored.publicId });
  } catch {
    await discardPublicTemplateMedia(stored.publicId);
    return NextResponse.json({ error: "تعذر التحقق من عينة Meta؛ لم يتم حفظ الوسائط.", reason: "META_UPLOAD_UNCONFIRMED" }, { status: 502 });
  }
}
