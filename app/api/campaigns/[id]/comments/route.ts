import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/options";
import { userHasDashboardPermission } from '@/lib/dashboard/permissions';
import { isObjectId } from '@/lib/slug';
import {
  writeAuditLog,
  auditActorFromSiteSession,
  auditStreamForRole,
} from '@/lib/audit-log';

type ParamsPromise = { params: Promise<{ id: string }> };

/**
 * The campaign URL param can be an ObjectId, a base slug, or a per-locale
 * translation slug. Comment.campaignId is an ObjectId, so resolve first or
 * Prisma raises P2023 ("Malformed ObjectID").
 */
async function resolveCampaignId(idOrSlug: string): Promise<string | null> {
  if (isObjectId(idOrSlug)) return idOrSlug;
  const c = await prisma.campaign.findFirst({
    where: {
      OR: [
        { slug: idOrSlug },
        { translations: { some: { slug: idOrSlug } } },
      ],
    },
    select: { id: true },
  });
  return c?.id ?? null;
}

// Get campaign comments
export async function GET(request: NextRequest, { params }: ParamsPromise) {
  try {
    const { id } = await params;
    const campaignId = await resolveCampaignId(id);
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    const comments = await prisma.comment.findMany({
      where: {
        campaignId,
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(comments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

// Add new comment
export async function POST(request: NextRequest, { params }: ParamsPromise) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const campaignId = await resolveCampaignId(id);
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const data = await request.json();
    const comment = await prisma.comment.create({
      data: {
        text: data.text,
        campaignId,
        userId: session.user.id,
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

    const camp = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { title: true },
    });
    const actor = auditActorFromSiteSession(session);
    await writeAuditLog({
      ...actor,
      action: "CAMPAIGN_COMMENT_CREATE",
      messageAr: `${actor.actorName ?? "مستخدم"} علّق على المشروع «${camp?.title ?? campaignId}»`,
      entityType: "Comment",
      entityId: comment.id,
      metadata: { campaignId },
      stream: auditStreamForRole(actor.actorRole),
    });

    return NextResponse.json(comment);
  } catch (error) {
    console.error("Error creating comment:", error);
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    );
  }
}

// Delete comment (commentId from query: ?commentId=xxx)
export async function DELETE(request: NextRequest, { params }: ParamsPromise) {
  try {
    await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const commentId = request.nextUrl.searchParams.get('commentId');
    if (!commentId) {
      return NextResponse.json({ error: 'Comment ID required' }, { status: 400 });
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
        ? `${actor.actorName ?? "مسؤول"} حذف تعليقًا على مشروع (إشراف)`
        : `${actor.actorName ?? "مستخدم"} حذف تعليقه على مشروع`,
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

// Update comment (commentId from query: ?commentId=xxx)
export async function PATCH(request: NextRequest, { params }: ParamsPromise) {
  try {
    await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const commentId = request.nextUrl.searchParams.get('commentId');
    if (!commentId) {
      return NextResponse.json({ error: 'Comment ID required' }, { status: 400 });
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
      messageAr: `${actor.actorName ?? "مستخدم"} عدّل تعليقه على مشروع`,
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