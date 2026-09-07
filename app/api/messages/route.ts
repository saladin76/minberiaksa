import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { isValidLocale } from "@/lib/locales";
import { writeAuditLog, auditActorFromSiteSession, auditStreamForRole } from "@/lib/audit-log";
import {
  isMessageSubject,
  type MessageSubject,
} from "@/lib/messages/subjects";

// POST /api/messages - Submit a message (public; optional session)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const messageBody = typeof body?.body === "string" ? body.body.trim() : "";
    const locale = isValidLocale(body?.locale) ? body.locale : "ar";
    const subject: MessageSubject = isMessageSubject(body?.subject) ? body.subject : "GENERAL";

    if (!messageBody || messageBody.length < 3) {
      return NextResponse.json(
        { error: "Message body is required (min 3 characters)" },
        { status: 400 }
      );
    }

    // Unlike guestName/guestEmail this is kept for signed-in senders too: it is the number they
    // asked to be reached on for THIS message, which the dashboard inbox turns into a WhatsApp
    // reply link. It used to be appended to the body as a "Phone: …" line instead.
    const contactPhone =
      typeof body.contactPhone === "string" ? body.contactPhone.trim().slice(0, 32) || null : null;

    const data: {
      body: string;
      locale: string;
      userId?: string;
      guestName?: string | null;
      guestEmail?: string | null;
    } = {
      body: messageBody,
      locale,
    };

    if (session?.user?.id) {
      data.userId = session.user.id;
    } else {
      const guestName = typeof body.guestName === "string" ? body.guestName.trim() || null : null;
      const guestEmail = typeof body.guestEmail === "string" ? body.guestEmail.trim() || null : null;
      data.guestName = guestName;
      data.guestEmail = guestEmail;
    }

    const message = await prisma.message.create({
      data: {
        subject,
        body: data.body,
        locale: data.locale,
        userId: data.userId ?? null,
        guestName: data.guestName ?? null,
        guestEmail: data.guestEmail ?? null,
        contactPhone,
      },
    });

    if (session?.user?.id) {
      const actor = auditActorFromSiteSession(session);
      await writeAuditLog({
        ...actor,
        action: "CONTACT_MESSAGE",
        messageAr: `${actor.actorName ?? "مستخدم"} أرسل رسالة تواصل (${locale}) - ${subject}`,
        entityType: "Message",
        entityId: message.id,
        stream: auditStreamForRole(actor.actorRole),
      });
    } else {
      await writeAuditLog({
        actorId: null,
        actorName: data.guestName ?? "زائر",
        actorRole: "GUEST",
        action: "CONTACT_MESSAGE",
        messageAr: `${data.guestName?.trim() || "زائر"} أرسل رسالة تواصل (${locale}) - ${subject}`,
        entityType: "Message",
        entityId: message.id,
        stream: "DONOR",
      });
    }

    return NextResponse.json({ success: true, id: message.id });
  } catch (err) {
    console.error("Error creating message:", err);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
