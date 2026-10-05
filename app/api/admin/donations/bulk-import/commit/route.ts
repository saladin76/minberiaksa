import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { importOrderId, sanitizeImportRow, IMPORT_PROVIDER, IMPORT_RUN_ID_RE, type ImportRowInput } from "@/lib/donations/bulk-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Rows per request  the dashboard sends batches of this size, well under the 4.5MB body limit. */
const MAX_BATCH = 1000;
const UPDATE_CONCURRENCY = 20;

type FinalizeBody = {
  runId: string;
  finalize: { fileHash?: string; totalRows?: number; validRows?: number; createdDonations?: number; createdDonors?: number; skippedRows?: number };
};

/**
 * Bulk donation import  COMMIT, one batch at a time. The dashboard parses the file in the browser
 * and posts normalized rows in batches (a whole large file would exceed Vercel's request-body limit
 * and function timeout). Every row is re-validated here with `sanitizeImportRow`. Per batch:
 *   1) resolves each donor by email (creates the User if new; back-fills only MISSING fields on existing),
 *   2) creates a Donation for every valid row  repeats/re-uploads are accepted (no donation-level
 *      dedup); donors are deduped by email so repeated donations append to the same user.
 *
 * Retry-safe: providerOrderId carries the run id, so re-sending a batch of the same run skips rows
 * that already landed. A final `{ runId, finalize }` call writes the single audit-log entry.
 *
 * SAFETY: imported donations are HISTORICAL records  `provider="IMPORT"`. This route does NOT call
 * dispatchDonationPaid / CAPI / receipts / Telegram, so no messages are sent and no donor data is
 * deleted.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "donors");
  if (denied) return denied;
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "قاعدة البيانات غير متاحة." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { runId?: unknown; rows?: unknown; finalize?: unknown } | null;
  const runId = typeof body?.runId === "string" && IMPORT_RUN_ID_RE.test(body.runId) ? body.runId : null;
  if (!runId) return NextResponse.json({ error: "معرّف عملية الاستيراد غير صالح." }, { status: 400 });

  if (body?.finalize && typeof body.finalize === "object") {
    return finalize(session!, { runId, finalize: body.finalize as FinalizeBody["finalize"] });
  }

  if (!Array.isArray(body?.rows)) return NextResponse.json({ error: "لا توجد صفوف في الطلب." }, { status: 400 });
  if (body.rows.length > MAX_BATCH) return NextResponse.json({ error: `الحد ${MAX_BATCH} صف لكل دفعة.` }, { status: 400 });

  const rows: ImportRowInput[] = [];
  let rejected = 0;
  for (const raw of body.rows) {
    const row = sanitizeImportRow(raw);
    if (row) rows.push(row);
    else rejected += 1;
  }
  if (!rows.length) return NextResponse.json({ ok: true, createdDonations: 0, createdDonors: 0, alreadyImported: 0, rejected });

  // ── Retry safety: skip rows of this run that a previous attempt already created ──
  const orderIds = rows.map((r) => importOrderId(runId, r.dedupKey));
  const landed = await prisma.donation.findMany({
    where: { provider: IMPORT_PROVIDER, providerOrderId: { in: orderIds } },
    select: { providerOrderId: true },
  });
  const landedSet = new Set(landed.map((d) => d.providerOrderId));
  const toImport = rows.filter((_, i) => !landedSet.has(orderIds[i]));
  const alreadyImported = rows.length - toImport.length;

  // ── Resolve donors by email (create new, back-fill missing on existing) ──
  const firstRowByEmail = new Map<string, ImportRowInput>();
  for (const r of toImport) if (r.email && !firstRowByEmail.has(r.email)) firstRowByEmail.set(r.email, r);
  const emails = [...firstRowByEmail.keys()];

  const existingUsers = emails.length
    ? await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true, name: true, phone: true, countryCode: true, countryName: true, region: true, preferredLang: true },
      })
    : [];
  const userByEmail = new Map<string, string>();
  for (const u of existingUsers) {
    const key = (u.email ?? "").toLowerCase();
    if (key) userByEmail.set(key, u.id);
  }

  const newUsers = emails
    .filter((email) => !userByEmail.has(email))
    .map((email) => {
      const r = firstRowByEmail.get(email)!;
      return { email, name: r.name, phone: r.phone, countryCode: r.countryCode, countryName: r.country, region: r.region, preferredLang: r.locale, role: "DONOR" as const };
    });

  let createdDonors = 0;
  if (newUsers.length) {
    try {
      createdDonors = (await prisma.user.createMany({ data: newUsers })).count;
    } catch {
      // A unique-email race fails the whole createMany  fall back to one at a time, reusing winners.
      for (const data of newUsers) {
        const ok = await prisma.user.create({ data, select: { id: true } }).then(() => true).catch(() => false);
        if (ok) createdDonors += 1;
      }
    }
    const created = await prisma.user.findMany({ where: { email: { in: newUsers.map((u) => u.email) } }, select: { id: true, email: true } });
    for (const u of created) if (u.email) userByEmail.set(u.email.toLowerCase(), u.id);
  }

  // Back-fill only genuinely-missing fields on pre-existing donors (never overwrite real data).
  const patches: { id: string; data: Prisma.UserUpdateInput }[] = [];
  for (const u of existingUsers) {
    const r = firstRowByEmail.get((u.email ?? "").toLowerCase());
    if (!r) continue;
    const data: Prisma.UserUpdateInput = {};
    if (!u.name && r.name) data.name = r.name;
    if (!u.phone && r.phone) data.phone = r.phone;
    if (!u.countryCode && r.countryCode) data.countryCode = r.countryCode;
    if (!u.countryName && r.country) data.countryName = r.country;
    if (!u.region && r.region) data.region = r.region;
    if (!u.preferredLang && r.locale) data.preferredLang = r.locale;
    if (Object.keys(data).length) patches.push({ id: u.id, data });
  }
  for (let i = 0; i < patches.length; i += UPDATE_CONCURRENCY) {
    await Promise.all(patches.slice(i, i + UPDATE_CONCURRENCY).map((p) => prisma.user.update({ where: { id: p.id }, data: p.data }).catch(() => {})));
  }

  // ── Build + create donations ──
  const data: Prisma.DonationCreateManyInput[] = [];
  let unresolved = 0;
  for (const r of toImport) {
    const donorId = userByEmail.get(r.email!);
    if (!donorId) { unresolved += 1; continue; }
    const createdAt = r.createdAtISO ? new Date(r.createdAtISO) : new Date();
    data.push({
      amount: r.amount!,
      amountUSD: r.amountUSD ?? null,
      currency: r.currency,
      totalAmount: r.amount!,
      status: r.status,
      locale: r.locale,
      provider: IMPORT_PROVIDER,
      providerOrderId: importOrderId(runId, r.dedupKey),
      providerTxnResult: r.status === "PAID" ? "Success" : "Failed",
      providerErrorMessage: r.status === "FAILED" ? r.errorCode ?? null : null,
      donorId,
      donorCountryCode: r.countryCode ?? null,
      comment: r.basket ?? null,
      attribution: {
        source: "bulk-import",
        importRunId: runId,
        basket: r.basket,
        keyId: r.keyId,
        country: r.country,
        region: r.region,
        errorCode: r.errorCode,
        usdRate: r.usdRate,
        euroRate: r.euroRate,
      } as Prisma.InputJsonValue,
      createdAt,
      paidAt: r.status === "PAID" ? createdAt : null,
    });
  }

  // Let a failure surface as a 500 so the dashboard retries this batch (retries are idempotent).
  const createdDonations = data.length ? (await prisma.donation.createMany({ data })).count : 0;

  return NextResponse.json({
    ok: true,
    createdDonations,
    createdDonors,
    linkedExistingDonors: existingUsers.length,
    alreadyImported,
    unresolved,
    rejected,
  });
}

async function finalize(session: Session, { runId, finalize: f }: FinalizeBody) {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  // Count what actually landed for this run rather than trusting the client's tally.
  const createdDonations = await prisma.donation.count({ where: { provider: IMPORT_PROVIDER, providerOrderId: { startsWith: importOrderId(runId, "") } } });
  const createdDonors = n(f.createdDonors);
  const actor = auditActorFromDashboardSession(session);
  await writeAuditLog({
    ...actor,
    action: "DONATIONS_BULK_IMPORT",
    messageAr: `استيراد تبرعات بالجملة  أُنشئ ${createdDonations} تبرع، ${createdDonors} متبرع جديد`,
    messageEn: `Bulk donation import  created ${createdDonations} donations, ${createdDonors} new donors`,
    metadata: {
      runId,
      fileHash: typeof f.fileHash === "string" ? f.fileHash.slice(0, 64) : null,
      totalRows: n(f.totalRows),
      validRows: n(f.validRows),
      createdDonations,
      createdDonors,
      skippedRows: n(f.skippedRows),
      externalCall: false,
    },
    stream: "TEAM",
  });
  return NextResponse.json({ ok: true, createdDonations });
}
