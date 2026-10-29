import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { accountRevision, publicSearchAccount } from "@/lib/marketing/google-search/accounts";
import { googleSearchClient, searchCredentials, SearchApiError } from "@/lib/marketing/google-search/client";
import { auditActorFromDashboardSession, queueAuditLog } from "@/lib/audit-log";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const customerId = z.string().transform(value => value.replaceAll("-", "").trim()).pipe(z.string().regex(/^\d{10}$/));
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test"), id: objectId, revision: z.string().length(64) }).strict(),
  z.object({ action: z.literal("save"), id: objectId.optional(), revision: z.string().length(64).optional(), name: z.string().trim().min(1).max(150), customerId, managerId: z.union([customerId, z.literal("")]).optional(), clientId: z.string().trim().max(500), clientSecret: z.string().trim().max(4000).optional(), refreshToken: z.string().trim().max(4000).optional(), developerToken: z.string().trim().max(4000).optional(), fundingType: z.enum(["PAID", "AD_GRANTS"]), enabled: z.boolean() }).strict(),
]);
export async function GET() {
  const denied = requireAdminOrDashboardPermission(await getServerSession(authOptions), "platformConnections"); if (denied) return denied;
  try { return reply({ accounts: (await prisma.marketingPlatformConnection.findMany({ where: { platform: "GOOGLE_ADS" }, orderBy: [{ name: "asc" }, { id: "asc" }] })).map(publicSearchAccount) }); }
  catch { return reply({ error: "ACCOUNTS_UNAVAILABLE" }, 503); }
}
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  // Authorize the action before any credential read or provider call.
  let input: z.infer<typeof schema>;
  try { input = schema.parse(await request.json()); } catch { return reply({ error: "ACCOUNT_INPUT_INVALID" }, 400); }
  const denied = requireAdminOrDashboardPermission(session, input.action === "test" ? "platformConnectionsTest" : "platformConnectionsManage"); if (denied) return denied;
  try {
    const existing = input.id ? await prisma.marketingPlatformConnection.findFirst({ where: { id: input.id, platform: "GOOGLE_ADS" } }) : null;
    if (input.id && !existing) return reply({ error: "ACCOUNT_NOT_FOUND" }, 404);
    if (existing && input.revision !== accountRevision(existing)) return reply({ error: "ACCOUNT_CHANGED_RELOAD" }, 409);
    const actor = auditActorFromDashboardSession(session!);
    if (input.action === "test") {
      if (!existing) return reply({ error: "ACCOUNT_NOT_FOUND" }, 404);
      const client = await googleSearchClient(searchCredentials(existing));
      const rows = await client.query("SELECT customer.id, customer.currency_code, customer.time_zone FROM customer LIMIT 1", 1);
      if (!rows.length) return reply({ error: "ACCOUNT_NOT_ACCESSIBLE" }, 403);
      const saved = await prisma.marketingPlatformConnection.updateMany({ where: { id: existing.id, updatedAt: existing.updatedAt }, data: { status: "ACTIVE", lastTestAt: new Date(), lastError: null } });
      if (saved.count !== 1) return reply({ error: "ACCOUNT_CHANGED_RELOAD" }, 409);
      queueAuditLog({ ...actor, action: "GOOGLE_SEARCH_ACCOUNT_TEST", entityType: "MarketingPlatformConnection", entityId: existing.id, messageAr: "اختبار قراءة حساب Google Ads", metadata: { externalCall: true, campaignMutations: 0 } });
      return reply({ ok: true, currency: rows[0].customer.currencyCode, timezone: rows[0].customer.timeZone });
    }
    if (existing && input.customerId !== existing.accountId?.replaceAll("-", "")) return reply({ error: "CREATE_SEPARATE_CUSTOMER_CONNECTION" }, 409);
    const previous = existing?.configChecklist && typeof existing.configChecklist === "object" && !Array.isArray(existing.configChecklist) ? existing.configChecklist : {};
    const data = { name: input.name, accountId: input.customerId, managerAccountId: input.managerId || null, appId: input.clientId || null, enabled: input.enabled, configChecklist: { ...previous, googleAdsFundingType: input.fundingType }, status: "MISSING_CONFIG", lastTestAt: null, lastError: null, updatedBy: actor.actorId ?? null, ...Object.fromEntries((["clientSecret", "refreshToken", "developerToken"] as const).filter(key => Boolean(input[key])).map(key => [key, input[key]!])) };
    let id: string;
    if (existing) {
      const saved = await prisma.marketingPlatformConnection.updateMany({ where: { id: existing.id, updatedAt: existing.updatedAt }, data });
      if (saved.count !== 1) return reply({ error: "ACCOUNT_CHANGED_RELOAD" }, 409);
      id = existing.id;
    } else id = (await prisma.marketingPlatformConnection.create({ data: { ...data, category: "ADS", platform: "GOOGLE_ADS", supportedLocales: [], supportedCountries: [] }, select: { id: true } })).id;
    queueAuditLog({ ...actor, action: "GOOGLE_SEARCH_ACCOUNT_SAVE", entityType: "MarketingPlatformConnection", entityId: id, messageAr: "حفظ اتصال حساب Google Ads", metadata: { externalCall: false, fundingType: input.fundingType } });
    return reply({ ok: true, id });
  } catch (error) {
    if (error instanceof SearchApiError) return reply({ error: error.code }, error.status);
    return reply({ error: "ACCOUNT_OPERATION_FAILED" }, 503);
  }
}
