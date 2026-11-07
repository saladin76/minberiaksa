import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getCountries } from "libphonenumber-js";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminSession } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { canonicalNetwork } from "@/lib/site-security/policy";
import {
  RULES_COLLECTION,
  VISITORS_COLLECTION,
  rawRows,
  readAccessRules,
  visitorDate,
  clearAccessRulesCache,
} from "@/lib/site-security/store";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(request: NextRequest) {
  const denied = requireAdminSession(await getServerSession(authOptions));
  if (denied) return denied;
  try {
    const page = Math.min(
        10000,
        Math.max(
          1,
          Number.parseInt(
            request.nextUrl.searchParams.get("page") || "1",
            10,
          ) || 1,
        ),
      ),
      q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 160) || "";
    const users = q
      ? await prisma.user.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          select: { id: true },
          take: 100,
        })
      : [];
    const filter = q
      ? {
          $or: [
            { ip: q },
            { country: q.toUpperCase() },
            { userId: { $in: users.map((user) => user.id) } },
          ],
        }
      : {};
    const [visits, count, rules] = await Promise.all([
      prisma.$runCommandRaw({
        find: VISITORS_COLLECTION,
        filter,
        sort: { lastSeenAt: -1 },
        skip: (page - 1) * 30,
        limit: 30,
        maxTimeMS: 3000,
      }),
      prisma.$runCommandRaw({
        count: VISITORS_COLLECTION,
        query: filter,
        maxTimeMS: 3000,
      }),
      readAccessRules(true),
    ]);
    const rows = rawRows(visits),
      ids = [
        ...new Set(
          rows
            .map((row) => row.userId)
            .filter(
              (id): id is string =>
                typeof id === "string" && /^[a-f0-9]{24}$/i.test(id),
            ),
        ),
      ];
    const members = ids.length
      ? await prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, email: true },
        })
      : [];
    return reply({
      rows: rows.map((row) => ({
        id: row._id,
        ip: row.ip,
        country: row.country,
        path: row.path,
        blocked: row.blocked,
        visits: row.visits,
        firstSeenAt: visitorDate(row.firstSeenAt),
        lastSeenAt: visitorDate(row.lastSeenAt),
        donor: members.find((member) => member.id === row.userId) || null,
      })),
      total: Number(count.n || 0),
      page,
      rules,
      searchTruncated: users.length === 100,
      retentionDays: 90,
    });
  } catch {
    return reply({ error: "SECURITY_READ_FAILED" }, 503);
  }
}
const input = z
  .object({
    kind: z.enum(["IP", "COUNTRY"]),
    value: z.string().trim().min(1).max(100),
    action: z.enum(["BLOCK", "ALLOW"]),
    reason: z.string().trim().min(3).max(200),
    expiresInHours: z.number().int().min(1).max(8760).nullable().optional(),
  })
  .strict();
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions),
    denied = requireAdminSession(session);
  if (denied) return denied;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_SECURITY_RULE" }, 400);
  const value =
    parsed.data.kind === "IP"
      ? canonicalNetwork(parsed.data.value)
      : getCountries().some((code) => code === parsed.data.value.toUpperCase())
        ? parsed.data.value.toUpperCase()
        : null;
  if (!value) return reply({ error: "INVALID_SECURITY_RULE" }, 400);
  try {
    const now = new Date(),
      id = createHash("sha256")
        .update(parsed.data.kind + ":" + value)
        .digest("hex"),
      expiresAt = parsed.data.expiresInHours
        ? new Date(
            now.getTime() + parsed.data.expiresInHours * 3600_000,
          ).toISOString()
        : null;
    const result = await prisma.$runCommandRaw({
      update: RULES_COLLECTION,
      updates: [
        {
          q: { _id: id },
          u: {
            $set: {
              kind: parsed.data.kind,
              value,
              action: parsed.data.action,
              reason: parsed.data.reason,
              enabled: true,
              expiresAt: expiresAt ? { $date: expiresAt } : null,
              updatedAt: { $date: now.toISOString() },
              updatedBy: session!.user.id,
            },
          },
          upsert: true,
        },
      ],
    });
    if (result.ok !== 1 || result.writeErrors)
      throw new Error("RULE_WRITE_FAILED");
    clearAccessRulesCache();
    queueAuditLog({
      ...auditActorFromDashboardSession(session!),
      action: "SITE_ACCESS_RULE_SAVE",
      entityType: "SiteAccessRule",
      entityId: id,
      messageAr: "تحديث قاعدة الوصول للموقع",
      metadata: { kind: parsed.data.kind, action: parsed.data.action },
    });
    return reply({ ok: true });
  } catch {
    return reply({ error: "SECURITY_WRITE_FAILED" }, 503);
  }
}
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions),
    denied = requireAdminSession(session);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (
    !body ||
    !/^[a-f0-9]{64}$/.test(body.id) ||
    typeof body.updatedAt !== "string" ||
    !Number.isFinite(new Date(body.updatedAt).getTime())
  )
    return reply({ error: "INVALID_SECURITY_RULE" }, 400);
  try {
    const result = await prisma.$runCommandRaw({
      update: RULES_COLLECTION,
      updates: [
        {
          q: { _id: body.id, updatedAt: { $date: body.updatedAt } },
          u: {
            $set: {
              enabled: false,
              updatedAt: { $date: new Date().toISOString() },
            },
          },
        },
      ],
    });
    if (result.ok !== 1 || result.writeErrors)
      throw new Error("RULE_WRITE_FAILED");
    if (result.n !== 1) return reply({ error: "RULE_CHANGED_RELOAD" }, 409);
    clearAccessRulesCache();
    queueAuditLog({
      ...auditActorFromDashboardSession(session!),
      action: "SITE_ACCESS_RULE_DISABLE",
      entityType: "SiteAccessRule",
      entityId: body.id,
      messageAr: "رفع قاعدة حظر الوصول للموقع",
    });
    return reply({ ok: true });
  } catch {
    return reply({ error: "SECURITY_WRITE_FAILED" }, 503);
  }
}
