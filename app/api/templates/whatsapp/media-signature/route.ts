import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import cloudinary from "@/lib/cloudinary";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

const FOLDER = "whatsapp-template-media";

type MediaKind = "IMAGE" | "VIDEO" | "DOCUMENT";

function resourceType(kind: MediaKind): "image" | "video" | "raw" {
  if (kind === "IMAGE") return "image";
  if (kind === "VIDEO") return "video";
  return "raw";
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;

  const body = await request.json().catch(() => null) as { kind?: unknown } | null;
  const kind = String(body?.kind ?? "").toUpperCase() as MediaKind;
  if (!["IMAGE", "VIDEO", "DOCUMENT"].includes(kind)) {
    return NextResponse.json({ error: "نوع الوسائط غير صالح." }, { status: 400 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "رفع الوسائط غير مهيأ على الخادم." }, { status: 503 });
  }

  const timestamp = Math.round(Date.now() / 1000);
  // Cloudinary raw assets keep the extension as part of the public ID. Without
  // .pdf the delivery URL can return an octet stream and fail Meta validation.
  const publicId = kind === "DOCUMENT" ? `${randomUUID()}.pdf` : undefined;
  const uploadParams = { folder: FOLDER, timestamp, ...(publicId ? { public_id: publicId } : {}) };
  const signature = cloudinary.utils.api_sign_request(uploadParams, apiSecret);
  const type = resourceType(kind);

  return NextResponse.json({
    cloudName,
    apiKey,
    timestamp,
    folder: FOLDER,
    signature,
    resourceType: type,
    publicId,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${type}/upload`,
  });
}

