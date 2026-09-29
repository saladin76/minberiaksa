import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/options";
import cloudinary from "@/lib/cloudinary";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

export const dynamic = "force-dynamic";

/** Cloudinary folder for campaign-update videos. */
const FOLDER = "campaign-updates";

/**
 * POST /api/upload/video-signature
 *
 * Signs a direct browser → Cloudinary video upload. Videos cannot go through
 * `/api/upload` like images: a serverless request body is capped at a few MB,
 * far below a phone video. The browser posts the file straight to Cloudinary
 * with this signature, so only the signing happens here.
 *
 * The signature covers the folder and timestamp, so it cannot be reused to
 * write anywhere else, and it expires with Cloudinary's one-hour window.
 * Dashboard users with the campaigns permission only.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "campaigns");
  if (denied) return denied;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "رفع الفيديو غير مهيأ على الخادم" }, { status: 503 });
  }

  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request({ folder: FOLDER, timestamp }, apiSecret);

  return NextResponse.json({
    cloudName,
    apiKey,
    timestamp,
    folder: FOLDER,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
  });
}
