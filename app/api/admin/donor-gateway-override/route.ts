import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminSession } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { isCountryCode, listCountryGatewayRules, listDonorGatewayOverrides, phoneKey, readDonorOverrideLog, setCountryGatewayRule, setDonorGatewayOverride } from "@/lib/donations/donor-gateway-override";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const CHOICES = ["AUTO", "PAYFOR", "ALBARAKA"] as const;
type Choice = (typeof CHOICES)[number];
const donorSelect = { id: true, name: true, email: true, phone: true } as const;

/** Admin only. ?q=<e-mail or phone> searches donors; otherwise lists pinned donors and the change log. */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;
  try {
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q) {
      if (q.length > 120) return reply({ error: "INVALID_QUERY" }, 400);
      const key = phoneKey(q);
      const donors = await prisma.user.findMany({
        where: q.includes("@") ? { email: q.toLowerCase() } : key ? { phone: { in: ["+" + key, key, q] } } : { id: "000000000000000000000000" },
        select: donorSelect, take: 5,
      });
      return reply({ donors });
    }
    const [overrides, countryRules, log] = await Promise.all([listDonorGatewayOverrides(), listCountryGatewayRules(), readDonorOverrideLog(50)]);
    const ids = [...new Set([...overrides.map((o) => o.userId), ...log.map((l) => l.userId ?? "")])].filter((id) => /^[a-f\d]{24}$/i.test(id));
    const donors = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: donorSelect }) : [];
    return reply({ overrides, countryRules, log, donors });
  } catch {
    return reply({ error: "OVERRIDES_UNAVAILABLE" }, 503);
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { scope?: unknown; userId?: unknown; country?: unknown; matchBy?: unknown; gateway?: unknown; reason?: unknown } | null;
  const scope = body?.scope === "COUNTRY" ? "COUNTRY" : "DONOR";
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const country = typeof body?.country === "string" ? body.country.trim().toUpperCase() : "";
  const matchBy = body?.matchBy === "IP" || body?.matchBy === "PHONE" ? body.matchBy : "ANY";
  const gateway = CHOICES.includes(body?.gateway as Choice) ? (body!.gateway as Choice) : null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!gateway || (scope === "DONOR" ? !/^[a-f\d]{24}$/i.test(userId) : !isCountryCode(country))) return reply({ error: "INVALID_REQUEST" }, 400);
  if (reason.length < 3 || reason.length > 300) return reply({ error: "REASON_REQUIRED" }, 400);
  const by = session?.user?.email || session?.user?.name || "admin";
  try {
    if (scope === "COUNTRY") {
      const change = await setCountryGatewayRule({ country, choice: gateway, matchBy, reason, by });
      queueAuditLog({
        ...auditActorFromDashboardSession(session!),
        action: "COUNTRY_GATEWAY_RULE", entityType: "GatewayCountryRule", entityId: country,
        messageAr: gateway === "AUTO" ? `إلغاء قاعدة بوابة الدفع لدولة ${country}` : `تحويل متبرعي ${country} إلى ${gateway}`,
        metadata: { from: change.from, to: change.to, matchBy, reason },
      });
      return reply({ ok: true, ...change });
    }
    const change = await setDonorGatewayOverride({ userId, choice: gateway, reason, by });
    queueAuditLog({
      ...auditActorFromDashboardSession(session!),
      action: "DONOR_GATEWAY_OVERRIDE",
      entityType: "User",
      entityId: userId,
      messageAr: gateway === "AUTO" ? "إلغاء تحويل بوابة الدفع لمتبرع" : `تحويل بوابة الدفع لمتبرع إلى ${gateway}`,
      metadata: { from: change.from, to: change.to, reason },
    });
    return reply({ ok: true, ...change });
  } catch (error) {
    const code = error instanceof Error && /^(INVALID_DONOR|DONOR_NOT_FOUND)$/.test(error.message) ? error.message : "OVERRIDE_WRITE_FAILED";
    return reply({ error: code }, code === "OVERRIDE_WRITE_FAILED" ? 503 : 404);
  }
}
