import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from '../../../../auth/[...nextauth]/options';
import { userHasDashboardPermission } from '@/lib/dashboard/permissions';
import {
  writeAuditLog,
  auditActorFromSiteSession,
  auditStreamForRole,
} from '@/lib/audit-log';

type ParamsPromise = { params: Promise<{ id: string; commentId: string }> };

// Delete comment
export async function DELETE(request: NextRequest, { params }: ParamsPromise) {
  try {
    const { commentId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return NextResponse.json(
        { error: "Comment not found" },
        { status: 404 }
      );
    }

    const canModerate = userHasDashboardPermission(session.user, 'campaigns');
    if (comment.userId !== session.user.id && !canModerate) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    await prisma.comment.delete({
      where: { id: commentId },
    });

    const actor = auditActorFromSiteSession(session);
    const stream = canModerate ? ("TEAM" as const) : auditStreamForRole(actor.actorRole);
    await writeAuditLog({
      ...actor,
      action: "CAMPAIGN_COMMENT_DELETE",
      messageAr: canModerate
        ? `${actor.actorName ?? "مسؤول"} حذف تعليقًا (مسار مباشر)`
        : `${actor.actorName ?? "مستخدم"} حذف تعليقه`,
      entityType: "Comment",
      entityId: commentId,
      metadata: { campaignId: comment.campaignId },
      stream,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting comment:", error);
    return NextResponse.json(
      { error: "Failed to delete comment" },
      { status: 500 }
    );
  }
}

// Update comment
export async function PATCH(request: NextRequest, { params }: ParamsPromise) {
  try {
    const { commentId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return NextResponse.json(
        { error: "Comment not found" },
        { status: 404 }
      );
    }

    // Only allow comment owner to edit
    if (comment.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const data = await request.json();
    const updatedComment = await prisma.comment.update({
      where: { id: commentId },
      data: {
        text: data.text,
      },
      include: {
        user: {
          select: {
            name: true,
            image: true,
            email: true,
          },
        },
      },
    });

    const actor = auditActorFromSiteSession(session);
    await writeAuditLog({
      ...actor,
      action: "CAMPAIGN_COMMENT_UPDATE",
      messageAr: `${actor.actorName ?? "مستخدم"} عدّل تعليقه`,
      entityType: "Comment",
      entityId: commentId,
      metadata: { campaignId: comment.campaignId },
      stream: auditStreamForRole(actor.actorRole),
    });

    return NextResponse.json(updatedComment);
  } catch (error) {
    console.error("Error updating comment:", error);
    return NextResponse.json(
      { error: "Failed to update comment" },
      { status: 500 }
    );
  }
} 