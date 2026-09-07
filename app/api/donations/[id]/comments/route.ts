import { NextRequest, NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/options';
import { userHasDashboardPermission } from '@/lib/dashboard/permissions';
import {
  writeAuditLog,
  auditActorFromSiteSession,
  auditStreamForRole,
} from '@/lib/audit-log';

// GET /api/donations/[id]/comments - Get comments for a donation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const total = await prisma.comment.count({
      where: { donationId: id },
    });

    // Get comments with pagination
    // `Comment` relates to the author via `user`/`userId` — not `donor`/`donorId`. The old
    // field names threw on every request, so donation comments never loaded or saved.
    const comments = await prisma.comment.findMany({
      where: { donationId: id },
      include: {
        user: {
          select: {
            name: true,
            image: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limit,
    });

    return NextResponse.json({
      comments,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        page,
        limit,
      },
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

// POST /api/donations/[id]/comments - Add a comment to a donation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { text } = body;

    // Validate required fields
    if (!text) {
      return NextResponse.json(
        { error: 'Comment text is required' },
        { status: 400 }
      );
    }

    // Check if donation exists
    const donation = await prisma.donation.findUnique({
      where: { id },
    });

    if (!donation) {
      return NextResponse.json(
        { error: 'Donation not found' },
        { status: 404 }
      );
    }

    // Create comment
    const comment = await prisma.comment.create({
      data: {
        text,
        userId: session.user.id,
        donationId: id,
      },
      include: {
        user: {
          select: {
            name: true,
            image: true,
          },
        },
      },
    });

    const actor = auditActorFromSiteSession(session);
    await writeAuditLog({
      ...actor,
      action: "DONATION_COMMENT_CREATE",
      messageAr: `${actor.actorName ?? "متبرع"} أضاف تعليقًا على تبرعه`,
      entityType: "Comment",
      entityId: comment.id,
      metadata: { donationId: id },
      stream: auditStreamForRole(actor.actorRole),
    });

    return NextResponse.json(comment);
  } catch (error) {
    console.error('Error creating comment:', error);
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}

// DELETE /api/donations/[id]/comments - Delete a comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params;
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const commentId = searchParams.get('commentId');

    if (!commentId) {
      return NextResponse.json(
        { error: 'Comment ID is required' },
        { status: 400 }
      );
    }

    // Get comment
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    const canModerate = userHasDashboardPermission(session.user, 'revenue');
    if (!canModerate && session.user.id !== comment.userId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Delete comment
    await prisma.comment.delete({
      where: { id: commentId },
    });

    const actor = auditActorFromSiteSession(session);
    const stream = canModerate ? ("TEAM" as const) : auditStreamForRole(actor.actorRole);
    await writeAuditLog({
      ...actor,
      action: "DONATION_COMMENT_DELETE",
      messageAr: canModerate
        ? `${actor.actorName ?? "مسؤول"} حذف تعليقًا على تبرع (إشراف)`
        : `${actor.actorName ?? "متبرع"} حذف تعليقه على تبرعه`,
      entityType: "Comment",
      entityId: commentId,
      metadata: { donationId: comment.donationId },
      stream,
    });

    return NextResponse.json(
      { message: 'Comment deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting comment:', error);
    return NextResponse.json(
      { error: 'Failed to delete comment' },
      { status: 500 }
    );
  }
} 