import { NextResponse } from 'next/server';
import type { UploadApiResponse } from 'cloudinary';
import cloudinary from '@/lib/cloudinary';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/options';
import { requireAdminOrDashboardPermission } from '@/lib/dashboard/api-auth';
import {
  queueAuditLog,
  auditActorFromSiteSession,
  auditStreamForRole,
} from '@/lib/audit-log';
import {
  MAX_DOCUMENT_BYTES,
  formatBytes,
  validateDocumentFile,
} from '@/lib/uploads/document-file-rules';

/**
 * PDF uploads for reports and booklets.
 *
 * Separate from `/api/upload` because that route pins Cloudinary to
 * `resource_type: 'image'`, which is wrong for a PDF. Sits behind the dashboard
 * permission rather than merely "signed in" — unlike a campaign photo, these
 * documents are published as the organisation's own reporting.
 */

/** Reports run to several megabytes; the default body cap rejects them early. */
export const maxDuration = 60;

function uploadBuffer(buffer: Buffer, folder: string, filename: string): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      /* `raw` stores the file byte-for-byte. `public_id` keeps the original
         name so a downloaded report is not called a random hash. */
      { folder, resource_type: 'raw', public_id: filename || undefined },
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
    const denied = requireAdminOrDashboardPermission(session, 'siteContent');
    if (denied) return denied;

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'لم يتم اختيار ملف' }, { status: 400 });
    }

    // Same rules the browser applies, re-checked here so the API can't be
    // handed something oversized by a stale tab or a direct call.
    const rejection = validateDocumentFile(file);
    if (rejection) {
      return NextResponse.json({ error: rejection }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
      return NextResponse.json(
        { error: `حجم الملف ${formatBytes(buffer.byteLength)} — الحد الأقصى ${formatBytes(MAX_DOCUMENT_BYTES)}.` },
        { status: 413 }
      );
    }

    /* Strip the extension: Cloudinary appends its own for raw resources, and a
       public_id ending in .pdf produces a URL ending in .pdf.pdf. */
    const baseName = (file.name || 'document').replace(/\.[^.]+$/, '');
    const result = await uploadBuffer(buffer, 'documents', baseName);

    const actor = auditActorFromSiteSession(session!);
    queueAuditLog({
      ...actor,
      action: 'DOCUMENT_UPLOAD',
      messageAr: `${actor.actorName ?? 'مسؤول'} رفع مستندًا (${file.name || 'ملف'})`,
      entityType: 'Media',
      metadata: { publicId: result.public_id, bytes: buffer.byteLength },
      stream: auditStreamForRole(actor.actorRole),
    });

    return NextResponse.json({
      url: result.secure_url,
      public_id: result.public_id,
      bytes: buffer.byteLength,
    });
  } catch (error) {
    console.error('Document upload error:', error);
    // Cloudinary reports its own reason (quota, credentials); passing it through
    // is what turns a dead end into something actionable.
    const detail =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
    return NextResponse.json(
      { error: detail ? `فشل رفع الملف: ${detail}` : 'فشل رفع الملف' },
      { status: 502 }
    );
  }
}
