import { NextResponse } from 'next/server';
import type { UploadApiResponse } from 'cloudinary';
import cloudinary from '@/lib/cloudinary';
import { isVpsImageId, publicImageStorageEnabled, removePublicImage, savePublicImage } from '@/lib/uploads/vps-public-image';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/options';
import {
  queueAuditLog,
  auditActorFromSiteSession,
  auditStreamForRole,
} from '@/lib/audit-log';
import {
  MAX_IMAGE_BYTES,
  formatBytes,
  validateImageFile,
} from '@/lib/uploads/image-file-rules';

/**
 * Hero/campaign image uploads.
 *
 * The upload used to be base64-encoded into a data URI before being handed to
 * Cloudinary  that buffers the whole file, inflates it by ~37%, and on a large
 * photo pushed the request past the platform's body/duration limits. Every such
 * failure came back as a bare "Internal error", so the admin only saw "فشل
 * الرفع" with no cause. Now the buffer is streamed straight through, the size
 * and type are checked up front, and failures say what actually happened.
 */

/** Hero photos are large; the default 4.5 MB body cap rejects them too early. */
export const maxDuration = 60;

function uploadBuffer(buffer: Buffer, folder: string): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error('Cloudinary returned no result'));
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'لم يتم اختيار ملف' }, { status: 400 });
    }

    // Same rules the browser applies, re-checked here so the API can't be
    // handed something oversized by a stale tab or a direct call.
    const rejection = validateImageFile(file);
    if (rejection) {
      return NextResponse.json({ error: rejection }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `حجم الصورة ${formatBytes(buffer.byteLength)}  الحد الأقصى ${formatBytes(MAX_IMAGE_BYTES)}.` },
        { status: 413 }
      );
    }

    // Prefer durable VPS storage. Old Cloudinary-backed URLs remain valid.
    // If VPS storage is configured but fails, fail closed instead of silently
    // switching providers: this makes operational outages visible.
    const result = publicImageStorageEnabled()
      ? await savePublicImage(buffer, file.type.toLowerCase())
      : await uploadBuffer(buffer, 'campaigns').then(asset => ({ url: asset.secure_url, public_id: asset.public_id }));

    const actor = auditActorFromSiteSession(session);
    queueAuditLog({
      ...actor,
      action: 'MEDIA_UPLOAD',
      messageAr: `${actor.actorName ?? 'مستخدم'} رفع ملفًا إلى التخزين (${file.name || 'ملف'})`,
      entityType: 'Media',
      metadata: { publicId: result.public_id, bytes: buffer.byteLength },
      stream: auditStreamForRole(actor.actorRole),
    });

    return NextResponse.json({
      url: result.url,
      public_id: result.public_id,
    });
  } catch (error) {
    console.error('Upload error:', error);
    // Cloudinary reports its own reason (quota, invalid image, credentials);
    // passing it through is what turns a dead end into something actionable.
    const detail =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
    return NextResponse.json(
      { error: detail ? `فشل رفع الصورة: ${detail}` : 'فشل رفع الصورة' },
      { status: 502 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const publicId = searchParams.get('publicId');

    if (!publicId) {
      return NextResponse.json({ error: 'Public ID is required' }, { status: 400 });
    }

    // Avoid deleting arbitrary provider IDs or an entire Cloudinary folder.
    if (isVpsImageId(publicId)) {
      await removePublicImage(publicId);
    } else {
      // Legacy deletion is kept only for the existing Cloudinary-backed assets.
      // The previous behavior is unchanged pending a separate deletion audit.
      await cloudinary.uploader.destroy(`campaigns/${publicId}`);
    }

    const actor = auditActorFromSiteSession(session);
    queueAuditLog({
      ...actor,
      action: 'MEDIA_DELETE',
      messageAr: `${actor.actorName ?? 'مستخدم'} حذف صورة من التخزين`,
      entityType: 'Media',
      metadata: { publicId },
      stream: auditStreamForRole(actor.actorRole),
    });

    return NextResponse.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ error: 'فشل حذف الصورة' }, { status: 502 });
  }
}
