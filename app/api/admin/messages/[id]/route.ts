import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog, auditActorFromSiteSession, auditStreamForRole } from "@/lib/audit-log";
import { decodeMessageBodySubject, isMessageSubject } from "@/lib/messages/subjects";
import {
  isMessageReplyChannel,
  REPLY_CHANNEL_LABELS,
  type MessageReplyChannel,
} from "@/lib/messages/inbox-status";
import { resolveContactPhone, splitTrailingPhone } from "@/lib/messages/contact-phone";

const ACTIONS = ["read", "unread", "replied", "unreplied"] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

/**
 * PATCH /api/admin/messages/[id] — move one message through the inbox triage states.
 *
 * `read` is fired automatically when the dialog opens, so it is written idempotently: re-opening
 * a message must not keep pushing `readAt` forward, or "opened 3 days ago" would always read as
 * "just now". `replied` likewise stamps the first answer and keeps it.
 *
 * Marking replied implies read — an answered message that still counted as unread would sit in
 * the sidebar badge forever.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "messages");
    if (denied) return denied;
    // The guard already 401s on a missing session, but it returns a response rather than
    // narrowing the type — this makes that guarantee visible to the compiler.
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await request.json().catch(() => null);
    const action = payload?.action;
    if (!isAction(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${ACTIONS.join(", ")}` },
        { status: 400 },
      );
    }

    const existing = await prisma.message.findUnique({
      where: { id },
      select: { id: true, readAt: true, repliedAt: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const now = new Date();
    const actorId = session?.user?.id ?? null;
    const actorName = session?.user?.name || session?.user?.email || "مسؤول";
    const via: MessageReplyChannel = isMessageReplyChannel(payload?.via) ? payload.via : "MANUAL";

    const data: Record<string, unknown> = {};
    if (action === "read") {
      if (existing.readAt) return respond(id);
      data.readAt = now;
    } else if (action === "unread") {
      // Back to untouched: an unread message that still claimed a reply would be incoherent.
      data.readAt = null;
      data.repliedAt = null;
      data.repliedVia = null;
      data.repliedById = null;
      data.repliedByName = null;
    } else if (action === "replied") {
      if (!existing.readAt) data.readAt = now;
      if (!existing.repliedAt) {
        data.repliedAt = now;
        data.repliedById = actorId;
        data.repliedByName = actorName;
      }
      // The channel is refreshed even on a repeat click: answering again by WhatsApp after an
      // email should show WhatsApp as the last thing that happened.
      data.repliedVia = via;
    } else {
      data.repliedAt = null;
      data.repliedVia = null;
      data.repliedById = null;
      data.repliedByName = null;
    }

    await prisma.message.update({ where: { id }, data });

    // Only the reply transitions are worth an audit entry — `read` fires on every open and
    // would drown the log.
    if (action === "replied" && !existing.repliedAt) {
      const actor = auditActorFromSiteSession(session);
      await writeAuditLog({
        ...actor,
        action: "CONTACT_MESSAGE_REPLIED",
        messageAr: `${actorName} حدّد رسالة واردة كمردود عليها (${REPLY_CHANNEL_LABELS[via]})`,
        entityType: "Message",
        entityId: id,
        stream: auditStreamForRole(actor.actorRole),
      });
    }

    return respond(id);
  } catch (err) {
    console.error("Error updating message triage state:", err);
    return NextResponse.json({ error: "Failed to update message" }, { status: 500 });
  }
}

/**
 * Returns the row in exactly the shape the list endpoint produces, so the client can splice the
 * response straight into its list instead of maintaining a second, subtly different mapper.
 */
async function respond(id: string) {
  const m = await prisma.message.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, name: true, email: true, image: true, phone: true, countryCode: true },
      },
    },
  });
  if (!m) return NextResponse.json({ error: "Message not found" }, { status: 404 });

  const decoded = decodeMessageBodySubject(m.body);
  const split = splitTrailingPhone(decoded.body);
  const { user, ...rest } = m;
  const { phone, whatsapp } = resolveContactPhone({
    contactPhone: m.contactPhone,
    bodyPhone: split.phone,
    userPhone: user?.phone,
    countryCode: user?.countryCode,
  });

  return NextResponse.json({
    message: {
      ...rest,
      body: split.body,
      subject: isMessageSubject(m.subject) ? m.subject : decoded.subject,
      phone,
      whatsapp,
      user: user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null,
    },
  });
}
