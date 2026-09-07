import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";

const COLLECTION = "BankAccount";
const TRANSACTIONS_COLLECTION = "BankTransferTransaction";
const SUPPORTED_CURRENCIES = ["USD", "TRY", "EUR"] as const;

const DEFAULT_BANKS = [
  { nameAr: "بنك زراعات كتاليم", nameEn: "Ziraat Katılım Bank", nameTr: "Ziraat Katılım Bankası", code: "ZIRAAT_KATILIM" },
  { nameAr: "بنك البركة", nameEn: "Albaraka Bank", nameTr: "Albaraka Türk", code: "ALBARAKA" },
  { nameAr: "بنك كويت ترك", nameEn: "Kuveyt Turk Bank", nameTr: "Kuveyt Türk", code: "KUVEYT_TURK" },
];

type BankRaw = Record<string, unknown>;
type StatsRaw = { _id?: unknown; count?: number; total?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mongoId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.$oid === "string") return value.$oid;
  return null;
}

function mongoDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.$date === "string") return value.$date;
  return null;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function cleanCurrency(value: unknown): "USD" | "TRY" | "EUR" {
  const upper = typeof value === "string" ? value.trim().toUpperCase() : "USD";
  return SUPPORTED_CURRENCIES.includes(upper as "USD" | "TRY" | "EUR") ? upper as "USD" | "TRY" | "EUR" : "USD";
}

async function getStats() {
  const result = await prisma.$runCommandRaw({
    aggregate: TRANSACTIONS_COLLECTION,
    pipeline: [
      { $match: { direction: "CREDIT", status: { $in: ["APPROVED", "IMPORTED"] } } },
      { $group: { _id: { bankId: "$bankId", currency: "$currency", donorLocale: "$donorLocale" }, count: { $sum: 1 }, total: { $sum: "$amount" } } },
    ],
    cursor: {},
  });
  const rows = isRecord(result) && isRecord(result.cursor) && Array.isArray(result.cursor.firstBatch)
    ? result.cursor.firstBatch as StatsRaw[]
    : [];
  const map = new Map<string, { operationCount: number; totals: Record<string, number>; localeTotals: Record<string, Record<string, number>> }>();
  for (const row of rows) {
    const id = isRecord(row._id) ? row._id : {};
    const bankId = typeof id.bankId === "string" ? id.bankId : "";
    if (!bankId) continue;
    const currency = typeof id.currency === "string" ? id.currency : "USD";
    const donorLocale = typeof id.donorLocale === "string" ? id.donorLocale : "ar";
    const item = map.get(bankId) ?? { operationCount: 0, totals: {}, localeTotals: {} };
    item.operationCount += typeof row.count === "number" ? row.count : 0;
    item.totals[currency] = (item.totals[currency] ?? 0) + (typeof row.total === "number" ? row.total : 0);
    item.localeTotals[donorLocale] = item.localeTotals[donorLocale] ?? {};
    item.localeTotals[donorLocale][currency] = (item.localeTotals[donorLocale][currency] ?? 0) + (typeof row.total === "number" ? row.total : 0);
    map.set(bankId, item);
  }
  return map;
}

function serializeBank(row: BankRaw, statsMap: Awaited<ReturnType<typeof getStats>>) {
  const id = mongoId(row._id) ?? mongoId(row.id);
  const code = cleanString(row.code);
  const stats = (id ? statsMap.get(id) : null) ?? (code ? statsMap.get(code) : null) ?? { operationCount: 0, totals: {}, localeTotals: {} };
  return {
    id,
    code,
    nameAr: cleanString(row.nameAr) ?? "بنك بدون اسم",
    nameEn: cleanString(row.nameEn),
    nameTr: cleanString(row.nameTr),
    accountName: cleanString(row.accountName),
    ibanLast4: cleanString(row.ibanLast4),
    currency: cleanCurrency(row.currency),
    isActive: row.isActive !== false,
    displayOrder: typeof row.displayOrder === "number" ? row.displayOrder : 0,
    stats,
    createdAt: mongoDate(row.createdAt),
    updatedAt: mongoDate(row.updatedAt),
  };
}

async function listRawBanks(): Promise<BankRaw[]> {
  const result = await prisma.$runCommandRaw({ find: COLLECTION, sort: { displayOrder: 1, createdAt: 1 } });
  return isRecord(result) && isRecord(result.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch as BankRaw[] : [];
}

async function ensureDefaultBanks() {
  const existing = await listRawBanks();
  const existingCodes = new Set(existing.map((b) => cleanString(b.code)).filter(Boolean));
  const now = new Date();
  const ziraat = existing.find((b) => cleanString(b.code) === "ZIRAAT_KATILIM");
  const ziraatId = mongoId(ziraat?._id) ?? mongoId(ziraat?.id);
  if (ziraatId && cleanString(ziraat?.nameAr) !== "بنك زراعات كتاليم") {
    await prisma.$runCommandRaw({ update: COLLECTION, updates: [{ q: { _id: { $oid: ziraatId } }, u: { $set: { nameAr: "بنك زراعات كتاليم", updatedAt: now } } }] });
  }
  const missing = DEFAULT_BANKS.filter((bank) => !existingCodes.has(bank.code)).map((bank, index) => ({ ...bank, currency: "USD", supportedCurrencies: [...SUPPORTED_CURRENCIES], isActive: true, displayOrder: existing.length + index + 1, createdAt: now, updatedAt: now }));
  if (missing.length) await prisma.$runCommandRaw({ insert: COLLECTION, documents: missing });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "bankTransfers");
    if (denied) return denied;
    await ensureDefaultBanks();
    const [banks, stats] = await Promise.all([listRawBanks(), getStats()]);
    return NextResponse.json({ banks: banks.map((bank) => serializeBank(bank, stats)), supportedCurrencies: SUPPORTED_CURRENCIES });
  } catch (error) {
    console.error("[bank-transfers] failed to list banks", error);
    return NextResponse.json({ error: "Failed to list bank accounts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "bankTransfers");
    if (denied) return denied;
    const body = await request.json().catch(() => null);
    if (!isRecord(body)) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const nameAr = cleanString(body.nameAr);
    if (!nameAr) return NextResponse.json({ error: "Bank Arabic name is required" }, { status: 400 });
    const now = new Date();
    const doc = { code: cleanString(body.code) ?? `CUSTOM_${Date.now()}`, nameAr, nameEn: cleanString(body.nameEn), nameTr: cleanString(body.nameTr), accountName: cleanString(body.accountName), ibanLast4: cleanString(body.ibanLast4), currency: cleanCurrency(body.currency), supportedCurrencies: [...SUPPORTED_CURRENCIES], isActive: true, displayOrder: typeof body.displayOrder === "number" ? body.displayOrder : 100, createdAt: now, updatedAt: now };
    await prisma.$runCommandRaw({ insert: COLLECTION, documents: [doc] });
    const [banks, stats] = await Promise.all([listRawBanks(), getStats()]);
    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({ ...actor, stream: "TEAM", action: "BANK_ACCOUNT_CREATED", messageAr: `${actor.actorName ?? "مسؤول"} أضاف بنكًا جديدًا للتحويلات البنكية`, entityType: "BankAccount", metadata: { bankName: nameAr, currency: doc.currency } });
    return NextResponse.json({ banks: banks.map((bank) => serializeBank(bank, stats)), supportedCurrencies: SUPPORTED_CURRENCIES }, { status: 201 });
  } catch (error) {
    console.error("[bank-transfers] failed to create bank", error);
    return NextResponse.json({ error: "Failed to create bank account" }, { status: 500 });
  }
}
