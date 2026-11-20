import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * A donor's communication state, per channel, from the same markers the senders enforce (owner, 2026-11-20):
 * the team sees what the donor decided before reaching out.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { isWhatsappExplicitlyUnsubscribed } = await import("@/lib/communication/campaign-audience-accounting");
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { email: true, phone: true } }),
    prisma.donorCommunicationProfile.findFirst({ where: { userId: id }, select: { consentSource: true, doNotContact: true, emailOptIn: true, lastConsentAt: true } }),
  ]);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const email = (user.email ?? "").trim().toLowerCase();
  const suppression = email
    ? ((await prisma.$runCommandRaw({ find: "EmailSuppression", filter: { $or: [{ email }, { address: email }, { emailNormalized: email }] }, limit: 1 }).catch(() => null)) as { cursor?: { firstBatch?: Array<{ reason?: string; type?: string }> } } | null)?.cursor?.firstBatch?.[0] ?? null
    : null;
  const undeliverable = await prisma.communicationDelivery
    .count({ where: { recipientUserId: id, channel: "WHATSAPP", status: "FAILED", errorMessage: { contains: "131026" } } })
    .catch(() => 0);
  const whatsappStopped = isWhatsappExplicitlyUnsubscribed(profile);
  return NextResponse.json({
    doNotContact: profile?.doNotContact === true,
    whatsapp: { hasPhone: Boolean(user.phone), stopped: whatsappStopped, at: whatsappStopped ? profile?.lastConsentAt ?? null : null, undeliverable },
    email: { hasEmail: Boolean(email), suppressed: suppression ? String(suppression.reason ?? suppression.type ?? "SUPPRESSED") : null, optedOut: profile?.emailOptIn === false && Boolean(suppression) },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
