import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { uploadMetaTemplateSample } from "@/lib/communication/providers/meta-whatsapp/templates";
import cloudinary from "@/lib/cloudinary";
import type { UploadApiResponse } from "cloudinary";

export const runtime = "nodejs";
export const maxDuration = 300;

const MEDIA_LIMITS: Record<string, { maxBytes: number; label: string; allowed: Set<string> }> = {
  IMAGE: {
    maxBytes: 5 * 1024 * 1024,
    label: "5MB",
    allowed: new Set(["image/jpeg", "image/png"]),
  },
  VIDEO: {
    maxBytes: 16 * 1024 * 1024,
    label: "16MB",
    allowed: new Set(["video/mp4"]),
  },
  DOCUMENT: {
    maxBytes: 100 * 1024 * 1024,
    label: "100MB",
    allowed: new Set(["application/pdf"]),
  },
};

function mediaKindForMime(type: string): keyof typeof MEDIA_LIMITS | null {
  if (MEDIA_LIMITS.IMAGE.allowed.has(type)) return "IMAGE";
  if (MEDIA_LIMITS.VIDEO.allowed.has(type)) return "VIDEO";
  if (MEDIA_LIMITS.DOCUMENT.allowed.has(type)) return "DOCUMENT";
  return null;
}

function validateMedia(type: string, size: number): { ok: true; kind: keyof typeof MEDIA_LIMITS } | { ok: false; error: string; status: number } {
  const kind = mediaKindForMime(type);
  if (!kind) return { ok: false, error: "نوع الملف غير مدعوم. استخدم JPG/PNG للصورة، MP4 للفيديو، أو PDF للمستند.", status: 400 };
  const limit = MEDIA_LIMITS[kind];
  if (!size || size > limit.maxBytes) {
    return { ok: false, error: `حجم ${kind === "IMAGE" ? "الصورة" : kind === "VIDEO" ? "الفيديو" : "المستند"} يجب ألا يتجاوز ${limit.label}.`, status: 413 };
  }
  return { ok: true, kind };
}

function isAllowedCloudinaryUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

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

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = await request.json().catch(() => null) as {
      url?: unknown;
      publicId?: unknown;
      name?: unknown;
      type?: unknown;
      size?: unknown;
    } | null;

    const url = typeof payload?.url === "string" ? payload.url : "";
    const publicId = typeof payload?.publicId === "string" ? payload.publicId : "";
    const name = typeof payload?.name === "string" ? payload.name : "template-media";
    const type = typeof payload?.type === "string" ? payload.type : "";
    const declaredSize = typeof payload?.size === "number" ? payload.size : 0;

    if (!url || !isAllowedCloudinaryUrl(url)) {
      return NextResponse.json({ error: "رابط الوسائط غير صالح أو ليس من Cloudinary." }, { status: 400 });
    }
    const declared = validateMedia(type, declaredSize);
    if (!declared.ok) return NextResponse.json({ error: declared.error }, { status: declared.status });

    let remote: Response;
    try {
      remote = await fetch(url, { redirect: "error" });
    } catch {
      return NextResponse.json({ error: "تعذر قراءة الملف المرفوع من التخزين." }, { status: 502 });
    }
    if (!remote.ok) {
      return NextResponse.json({ error: "تعذر قراءة الملف المرفوع من التخزين.", detail: `HTTP ${remote.status}` }, { status: 502 });
    }

    const remoteType = (remote.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (remoteType && remoteType !== type.toLowerCase()) {
      return NextResponse.json({ error: "نوع الملف المخزن لا يطابق النوع المرسل.", detail: remoteType }, { status: 400 });
    }
    const contentLength = Number(remote.headers.get("content-length") ?? 0);
    if (contentLength) {
      const remoteCheck = validateMedia(type, contentLength);
      if (!remoteCheck.ok) return NextResponse.json({ error: remoteCheck.error }, { status: remoteCheck.status });
    }

    const bytes = new Uint8Array(await remote.arrayBuffer());
    const actual = validateMedia(type, bytes.byteLength);
    if (!actual.ok) return NextResponse.json({ error: actual.error }, { status: actual.status });

    const result = await uploadMetaTemplateSample({ bytes, name, type });
    if (!result.ok) {
      return NextResponse.json(
        { error: "تعذر رفع عينة الوسائط إلى Meta.", reason: result.reason, detail: result.detail },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, handle: result.handle, url, publicId });
  }

  // Legacy small-file path kept for compatibility. Large uploads use browser -> Cloudinary directly.
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "اختر ملفًا صالحًا." }, { status: 400 });

  const checked = validateMedia(file.type, file.size);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });

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
