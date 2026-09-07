import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { parseDonationImportBuffer, importOrderId, IMPORT_PROVIDER, type ParsedDonationRow } from "@/lib/donations/bulk-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMPORT = 5000;
const CHUNK = 500;

/**
 * Bulk donation import — COMMIT. Re-parses the uploaded file (never trusts client-sent rows), then:
 *   1) resolves each donor by email (creates the User if new; back-fills only MISSING fields on existing),
 *   2) creates a Donation for EVERY valid row — repeats/re-uploads are accepted (no donation-level
 *      dedup); donors are deduped by email so repeated donations append to the same user.
 *
 * SAFETY: imported donations are HISTORICAL records — `provider="IMPORT"`. This route does NOT call
 * dispatchDonationPaid / CAPI / receipts / Telegram, so no messages are sent and no donor data is
 * deleted. Rows without a valid email or a positive amount are skipped (email is the dedup key).
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "donors");
  if (denied) return denied;
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "قاعدة البيانات غير متاحة." }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "الرجاء رفع ملف Excel أو CSV." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "حجم الملف كبير جدًا (الحد 10MB)." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseDonationImportBuffer(buffer);
  const valid = parsed.rows.filter((r) => r.valid && r.email && r.amount && r.amount > 0);
  if (valid.length === 0) {
    return NextResponse.json({ error: "لا توجد صفوف صالحة للاستيراد (يلزم بريد إلكتروني ومبلغ صحيح).", warnings: parsed.warnings }, { status: 400 });
  }

  // Import EVERY valid row — repeats/re-uploads are accepted (no donation-level dedup). Only donors
  // are deduped by email, so repeated donations append to the same user.
  let toImport = valid;
  const truncated = toImport.length > MAX_IMPORT;
  if (truncated) toImport = toImport.slice(0, MAX_IMPORT);
  const skippedDuplicate = 0;

  // ── Resolve donors by email (create new, back-fill missing on existing) ──
  const firstRowByEmail = new Map<string, ParsedDonationRow>();
  for (const r of toImport) if (r.email && !firstRowByEmail.has(r.email)) firstRowByEmail.set(r.email, r);
  const emails = [...firstRowByEmail.keys()];

  const existingUsers = await prisma.user
    .findMany({ where: { email: { in: emails } }, select: { id: true, email: true, name: true, phone: true, countryCode: true, countryName: true, region: true, preferredLang: true } })
    .catch(() => []);
  const userByEmail = new Map<string, { id: string }>();
  const existingEmailSet = new Set<string>();
  for (const u of existingUsers) {
    const key = (u.email ?? "").toLowerCase();
    if (key) { userByEmail.set(key, { id: u.id }); existingEmailSet.add(key); }
  }

  let createdDonors = 0;
  for (const email of emails) {
    if (userByEmail.has(email)) continue;
    const r = firstRowByEmail.get(email)!;
    try {
      const created = await prisma.user.create({
        data: { email, name: r.name, phone: r.phone, countryCode: r.countryCode, countryName: r.country, region: r.region, preferredLang: r.locale, role: "DONOR" },
        select: { id: true },
      });
      userByEmail.set(email, created);
      createdDonors += 1;
    } catch {
      // Unique-email race or partial dup — re-fetch and reuse.
      const u = await prisma.user.findUnique({ where: { email }, select: { id: true } }).catch(() => null);
      if (u) userByEmail.set(email, u);
    }
  }

  // Back-fill only genuinely-missing fields on pre-existing donors (never overwrite real data).
  for (const u of existingUsers) {
    const email = (u.email ?? "").toLowerCase();
    const r = firstRowByEmail.get(email);
    if (!r) continue;
    const patch: Prisma.UserUpdateInput = {};
    if (!u.name && r.name) patch.name = r.name;
    if (!u.phone && r.phone) patch.phone = r.phone;
    if (!u.countryCode && r.countryCode) patch.countryCode = r.countryCode;
    if (!u.countryName && r.country) patch.countryName = r.country;
    if (!u.region && r.region) patch.region = r.region;
    if (!u.preferredLang && r.locale) patch.preferredLang = r.locale;
    if (Object.keys(patch).length) await prisma.user.update({ where: { id: u.id }, data: patch }).catch(() => {});
  }

  // ── Build + create donations ──
  const data: Prisma.DonationCreateManyInput[] = [];
  let unresolved = 0;
  for (const r of toImport) {
    const user = userByEmail.get(r.email!);
    if (!user) { unresolved += 1; continue; }
    const createdAt = r.createdAtISO ? new Date(r.createdAtISO) : new Date();
    data.push({
      amount: r.amount!,
      amountUSD: r.amountUSD ?? null,
      currency: r.currency,
      totalAmount: r.amount!,
      status: r.status,
      locale: r.locale,
      provider: IMPORT_PROVIDER,
      providerOrderId: importOrderId(r.dedupKey),
      providerTxnResult: r.status === "PAID" ? "Success" : "Failed",
      providerErrorMessage: r.status === "FAILED" ? r.errorCode ?? null : null,
      donorId: user.id,
      donorCountryCode: r.countryCode ?? null,
      comment: r.basket ?? null,
      attribution: {
        source: "bulk-import",
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

  let createdDonations = 0;
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK);
    const res = await prisma.donation.createMany({ data: chunk }).catch(() => null);
    if (res) createdDonations += res.count;
  }

  const actor = auditActorFromDashboardSession(session!);
  await writeAuditLog({
    ...actor,
    action: "DONATIONS_BULK_IMPORT",
    messageAr: `استيراد تبرعات بالجملة — أُنشئ ${createdDonations} تبرع، ${createdDonors} متبرع جديد، تخطّي ${skippedDuplicate} مكرر`,
    messageEn: `Bulk donation import — created ${createdDonations} donations, ${createdDonors} new donors, skipped ${skippedDuplicate} duplicates`,
    metadata: {
      fileHash: parsed.fileHash,
      totalRows: parsed.totalRows,
      validRows: valid.length,
      createdDonations,
      createdDonors,
      skippedDuplicate,
      unresolved,
      truncated,
      externalCall: false,
    },
    stream: "TEAM",
  });

  return NextResponse.json({
    ok: true,
    createdDonations,
    createdDonors,
    linkedExistingDonors: emails.length - createdDonors,
    skippedDuplicate,
    unresolved,
    truncated,
    warnings: parsed.warnings,
  });
}
