import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { isValidLocale, DEFAULT_LOCALE } from "@/lib/locales";
import { writeAuditLog, auditActorFromSiteSession, auditStreamForRole } from "@/lib/audit-log";
import { recordConciergeEvents } from "@/lib/ai/concierge/events";
import { clientKey, hit } from "@/lib/ai/concierge/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/donation-concierge/support — a message to the team, filed
 * from the concierge panel. Lands in the same `Message` collection the
 * contact form writes to, so it shows up in /dashboard/inbox with the
 * existing triage, tagged `source: "AI_CHAT"`.
 *
 * A signed-in sender is identified by the session; a visitor must give a
 * name and an email so the team can answer. The donation it is about is
 * accepted only when it belongs to the signed-in sender. The last few
 * turns of the chat are appended so the team sees what was already said.
 */

const schema = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  locale: z.string().min(2).max(5),
  subject: z.enum(["COMPLAINT", "DONATION_ISSUE", "CAMPAIGN_SUPPORT", "PARTNERSHIP", "VOLUNTEERING", "GENERAL"]),
  donationId: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable().optional(),
  reason: z.string().trim().min(3).max(2000),
  guestName: z.string().trim().max(120).optional(),
  guestEmail: z.string().trim().email().max(200).optional(),
  guestPhone: z.string().trim().max(32).optional(),
  transcript: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(600) })).max(8).optional(),
});

function noStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

export async function POST(request: NextRequest) {
  const limit = hit(clientKey(request.headers, "concierge-support"), 5, 10 * 60_000);
  if (!limit.ok) return noStore({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "Invalid request", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  const input = parsed.data;
  const locale = isValidLocale(input.locale) ? input.locale : DEFAULT_LOCALE;

  const session = await getServerSession(authOptions).catch(() => null);
  const userId = typeof session?.user?.id === "string" ? session.user.id : null;
  if (!userId && (!input.guestName || !input.guestEmail)) {
    return noStore({ error: "A name and an email are needed so the team can reply" }, { status: 400 });
  }

  /* The donation the message is about: only the sender's own. */
  let donation: { id: string; createdAt: Date; totalAmount: number; currency: string; status: string; paidAt: Date | null; paymentMethod: string | null } | null = null;
  if (input.donationId && userId) {
    donation = await prisma.donation.findFirst({
      where: { id: input.donationId, donorId: userId },
      select: { id: true, createdAt: true, totalAmount: true, currency: true, status: true, paidAt: true, paymentMethod: true },
    });
  }

  const contextLines: string[] = [];
  if (donation) {
    contextLines.push(
      `Donation ${donation.id} · ${donation.createdAt.toISOString().slice(0, 10)} · ${donation.totalAmount} ${donation.currency} · ${donation.paymentMethod ?? "-"} · ${donation.status}${donation.paidAt ? " (confirmed)" : " (not confirmed)"}`
    );
  }
  if (input.transcript?.length) {
    contextLines.push("", "— Chat with the giving assistant —");
    for (const t of input.transcript) contextLines.push(`${t.role === "user" ? "Visitor" : "Assistant"}: ${t.text.replace(/\s+/g, " ").trim()}`);
  }
  const body = contextLines.length ? `${input.reason}\n\n— Context —\n${contextLines.join("\n")}` : input.reason;

  const message = await prisma.message.create({
    data: {
      subject: input.subject,
      body,
      locale,
      userId,
      guestName: userId ? null : input.guestName ?? null,
      guestEmail: userId ? null : input.guestEmail ?? null,
      contactPhone: input.guestPhone?.slice(0, 32) || null,
      source: "AI_CHAT",
      donationId: donation?.id ?? null,
    },
  });

  const actor: { actorId: string | null; actorName: string | null | undefined; actorRole: string } =
    session?.user?.id ? auditActorFromSiteSession(session) : { actorId: null, actorName: input.guestName ?? "زائر", actorRole: "GUEST" };
  await writeAuditLog({
    ...actor,
    action: "CONTACT_MESSAGE",
    messageAr: `${actor.actorName ?? "مستخدم"} أرسل رسالة عبر مساعد العطاء (${locale}) - ${input.subject}`,
    entityType: "Message",
    entityId: message.id,
    stream: auditStreamForRole(actor.actorRole),
  }).catch(() => undefined);

  void recordConciergeEvents([{ sessionId: input.sessionId, event: "support_ticket_sent", locale, intent: "support", mode: "client" }]);
  return noStore({ ok: true, id: message.id });
}
