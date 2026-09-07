import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/options';
import { requireAdminOrDashboardPermission } from '@/lib/dashboard/api-auth';
import { queueAuditLog, auditActorFromDashboardSession } from '@/lib/audit-log';
import { writeErrorMessage } from '@/lib/dashboard/write-error-message';

/** Guards against a malformed or unbounded payload reaching the transaction. */
const MAX_REORDER_ITEMS = 200;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'slides');
    if (denied) return denied;
    const body = await req.json();
    const { slides } = body;
    if (!Array.isArray(slides)) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    if (slides.length === 0) return NextResponse.json({ message: 'Nothing to reorder' }, { status: 200 });
    if (slides.length > MAX_REORDER_ITEMS) {
      return NextResponse.json({ error: 'عدد الشرائح كبير جدًا' }, { status: 400 });
    }

    // Validate before writing: an entry with a missing id or a non-numeric
    // order used to reach Prisma and fail the whole transaction mid-way.
    const updates: { id: string; order: number }[] = [];
    for (const raw of slides) {
      const id = raw?.id;
      const order = raw?.order;
      if (typeof id !== 'string' || !id || typeof order !== 'number' || !Number.isFinite(order)) {
        return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
      }
      updates.push({ id, order });
    }

    await prisma.$transaction(updates.map(({ id, order }) => prisma.slide.update({ where: { id }, data: { order } })));

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "SLIDE_REORDER",
      messageAr: `${actor.actorName ?? "مسؤول"} أعاد ترتيب شرائح الهيرو (${updates.length} شريحة)`,
      entityType: "Slide",
      metadata: { count: updates.length },
    });

    return NextResponse.json({ message: 'Slides reordered' }, { status: 200 });
  } catch (error) {
    console.error('Error reordering slides:', error);
    return NextResponse.json({ error: writeErrorMessage(error, 'تعذّر حفظ الترتيب') }, { status: 500 });
  }
}
