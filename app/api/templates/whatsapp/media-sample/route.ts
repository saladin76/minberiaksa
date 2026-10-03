import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { uploadMetaTemplateSample } from "@/lib/communication/providers/meta-whatsapp/templates";
import cloudinary from "@/lib/cloudinary";
import type { UploadApiResponse } from "cloudinary";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

function uploadPublicCopy(buffer: Buffer, file: File): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const isPdf = file.type === "application/pdf";
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "whatsapp-template-media",
        resource_type: isPdf ? "raw" : "auto",
        ...(isPdf ? { public_id: file.name.replace(/\.[^.]+$/, "") || undefined } : {}),
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Cloudinary returned no result"));
        resolve(result);
      },
    );
    stream.end(buffer);
  });
}

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

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadMetaTemplateSample({
    bytes: new Uint8Array(buffer),
    name: file.name,
    type: file.type,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "تعذر رفع عينة الوسائط إلى Meta.", reason: result.reason, detail: result.detail },
      { status: 502 },
    );
  }

  /*
   * Meta's header_handle is only a review sample. Real sends need an accessible media URL (or media
   * id), so store a durable public copy at the same time. This keeps authoring and runtime aligned:
   * a media template that can be approved can also actually be sent later.
   */
  let publicCopy: UploadApiResponse;
  try {
    publicCopy = await uploadPublicCopy(buffer, file);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "تم رفع العينة إلى Meta لكن تعذر حفظ نسخة عامة للإرسال الفعلي.", reason: "MEDIA_STORAGE_FAILED", detail },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    handle: result.handle,
    url: publicCopy.secure_url,
    publicId: publicCopy.public_id,
  });
}
