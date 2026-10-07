import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { getMetaPhoneCapacity } from "@/lib/communication/providers/meta-whatsapp/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configuredFallback(): number {
  const raw = Number(process.env.COMMUNICATION_WHATSAPP_DAILY_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 1_000_000) : 100_000;
}

function tierDailyCap(value: string | null): number | null {
  const tier = String(value ?? "").trim().toUpperCase();
  if (!tier) return null;
  if (tier.includes("UNLIMITED")) return 1_000_000;
  if (/(^|_)250($|_)/.test(tier)) return 250;
  if (tier.includes("1K") || tier.includes("1000")) return 1_000;
  if (tier.includes("10K") || tier.includes("10000")) return 10_000;
  if (tier.includes("100K") || tier.includes("100000")) return 100_000;
  if (tier.includes("1M") || tier.includes("1000000")) return 1_000_000;
  return null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const fallback = configuredFallback();
  const senders = await prisma.communicationSender.findMany({
    where: {
      channel: "WHATSAPP",
      provider: "META_WHATSAPP",
      enabled: true,
      status: "ACTIVE",
      phoneNumberId: { not: null },
    },
    select: { id: true, name: true, phoneNumberId: true, isDefault: true },
    orderBy: [{ isDefault: "desc" }, { priority: "asc" }],
  }).catch(() => []);

  const rows = await Promise.all(
    senders.map(async (sender) => {
      const result = sender.phoneNumberId ? await getMetaPhoneCapacity(sender.phoneNumberId) : null;
      const tier = result?.ok ? result.messagingLimitTier : null;
      return {
        senderId: sender.id,
        senderName: sender.name,
        isDefault: sender.isDefault,
        tier,
        cap: tierDailyCap(tier),
        qualityRating: result?.ok ? result.qualityRating : null,
      };
    }),
  );

  const knownCaps = rows.map((row) => row.cap).filter((cap): cap is number => typeof cap === "number" && cap > 0);
  // A campaign may route through more than one sender. Use the smallest known Meta tier so the
  // campaign-level guard never promises more than the least-capable active sender can safely handle.
  const metaCap = knownCaps.length ? Math.min(...knownCaps) : null;

  return NextResponse.json({
    ok: true,
    dailyCap: metaCap ?? fallback,
    source: metaCap ? "META" : "FALLBACK",
    fallbackCap: fallback,
    senders: rows,
  });
}
