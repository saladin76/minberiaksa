import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { statementRead } from "@/lib/bank-transfers/statement-import";
import { rawCommand } from "@/lib/prisma-raw-command";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "BankTransferTransaction";
const ALLOWED_STATUSES = new Set([
  "PENDING_REVIEW",
  "APPROVED",
  "IMPORTED",
  "IGNORED",
]);
const ALLOWED_SORT_FIELDS = new Set([
  "createdAt",
  "transactionDate",
  "amount",
  "donorName",
  "bankId",
  "status",
  "donorLocale",
  "finalProject",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mongoDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.$date === "string") return value.$date;
  return null;
}

function mongoId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.$oid === "string") return value.$oid;
  return null;
}

function clean(value: string | null) {
  return value && value.trim() ? value.trim() : null;
}

function toNumber(value: string | null) {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function serialize(row: Record<string, unknown>) {
  const suggestedProject =
    typeof row.suggestedProject === "string"
      ? row.suggestedProject
      : "تبرع عام";
  return {
    id: mongoId(row._id) ?? mongoId(row.id),
    bankId: typeof row.bankId === "string" ? row.bankId : null,
    bankIban: typeof row.bankIban === "string" ? row.bankIban : null,
    transactionAt:
      typeof row.transactionAt === "string" ? row.transactionAt : null,
    balance: typeof row.balance === "number" ? row.balance : null,
    channel: typeof row.channel === "string" ? row.channel : null,
    approvalPending: Boolean(row.approvalClaim),
    transactionDate:
      typeof row.transactionDate === "string" ? row.transactionDate : null,
    donorName: typeof row.donorName === "string" ? row.donorName : null,
    description: typeof row.description === "string" ? row.description : "",
    amount: typeof row.amount === "number" ? row.amount : null,
    currency: typeof row.currency === "string" ? row.currency : "USD",
    donorLocale: typeof row.donorLocale === "string" ? row.donorLocale : "ar",
    transferMethod:
      typeof row.transferMethod === "string"
        ? row.transferMethod
        : "BANK_TRANSFER",
    suggestedProject,
    finalProject:
      typeof row.finalProject === "string"
        ? row.finalProject
        : suggestedProject,
    campaignId: typeof row.campaignId === "string" ? row.campaignId : null,
    donorContact:
      typeof row.donorContact === "string" ? row.donorContact : null,
    donationId: typeof row.donationId === "string" ? row.donationId : null,
    confidence: typeof row.confidence === "string" ? row.confidence : "LOW",
    reference: typeof row.reference === "string" ? row.reference : null,
    status: typeof row.status === "string" ? row.status : "IMPORTED",
    reviewedByName:
      typeof row.reviewedByName === "string" ? row.reviewedByName : null,
    approvedAt: mongoDate(row.approvedAt),
    ignoredAt: mongoDate(row.ignoredAt),
    createdAt: mongoDate(row.createdAt),
  };
}

function regex(value: string) {
  return value.slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildFilter(url: URL) {
  const filter: Record<string, unknown> = {
    direction: "CREDIT",
    status: { $nin: ["DUPLICATE", "DELETED"] },
  };
  const status = clean(url.searchParams.get("status"));
  const bankId = clean(url.searchParams.get("bankId"));
  const currency = clean(url.searchParams.get("currency"));
  const donorLocale = clean(url.searchParams.get("donorLocale"));
  const project = clean(url.searchParams.get("project"));
  const q = clean(url.searchParams.get("q"));
  const dateFrom = clean(url.searchParams.get("dateFrom"));
  const dateTo = clean(url.searchParams.get("dateTo"));
  const amountMin = toNumber(url.searchParams.get("amountMin"));
  const amountMax = toNumber(url.searchParams.get("amountMax"));

  if (status && ALLOWED_STATUSES.has(status)) filter.status = status;
  if (bankId && bankId !== "all") filter.bankId = bankId;
  if (currency && currency !== "all") filter.currency = currency;
  if (donorLocale && donorLocale !== "all") filter.donorLocale = donorLocale;
  if (project && project !== "all")
    filter.finalProject = { $regex: regex(project), $options: "i" };
  if (dateFrom || dateTo) {
    const range: Record<string, string> = {};
    if (dateFrom) range.$gte = dateFrom;
    if (dateTo) range.$lte = dateTo;
    filter.transactionDate = range;
  }
  if (amountMin !== null || amountMax !== null) {
    const range: Record<string, number> = {};
    if (amountMin !== null) range.$gte = amountMin;
    if (amountMax !== null) range.$lte = amountMax;
    filter.amount = range;
  }
  if (q) {
    filter.$or = [
      { donorName: { $regex: regex(q), $options: "i" } },
      { description: { $regex: regex(q), $options: "i" } },
      { finalProject: { $regex: regex(q), $options: "i" } },
      { suggestedProject: { $regex: regex(q), $options: "i" } },
      { reference: { $regex: regex(q), $options: "i" } },
      { bankId: { $regex: regex(q), $options: "i" } },
    ];
  }
  return filter;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "bankTransfers");
    if (denied) return denied;

    const url = new URL(request.url);
    const page = Math.max(
      1,
      Math.min(100000, Math.floor(Number(url.searchParams.get("page")) || 1)),
    );
    const limit = Math.min(
      200,
      Math.max(10, Math.floor(Number(url.searchParams.get("limit")) || 50)),
    );
    const skip = (page - 1) * limit;
    const sortByRaw = clean(url.searchParams.get("sortBy")) ?? "createdAt";
    const sortBy = ALLOWED_SORT_FIELDS.has(sortByRaw) ? sortByRaw : "createdAt";
    const sortDir = url.searchParams.get("sortDir") === "asc" ? 1 : -1;
    const filter = buildFilter(url);

    const [result, countResult, statsResult] = await Promise.all([
      statementRead(
        prisma,
        COLLECTION,
        filter,
        { raw: 0 },
        { sort: { [sortBy]: sortDir, _id: -1 }, skip, limit },
      ),
      prisma.$runCommandRaw(rawCommand({ count: COLLECTION, query: filter })),
      prisma.bankTransferTransactionRecord.aggregateRaw({
        pipeline: [
          { $match: rawCommand(filter) },
          {
            $group: {
              _id: { status: "$status", currency: "$currency" },
              count: { $sum: 1 },
              amount: { $sum: "$amount" },
            },
          },
        ],
        options: { maxTimeMS: 15000 },
      }),
    ]);

    const rows = result;
    if (
      !isRecord(countResult) ||
      typeof countResult.n !== "number" ||
      !Array.isArray(statsResult)
    )
      throw new Error("Incomplete statement listing");
    const summary: {
      counts: Record<string, number>;
      approvedTotals: Record<string, number>;
    } = { counts: {}, approvedTotals: {} };
    for (const row of statsResult) {
      if (!isRecord(row) || !isRecord(row._id)) continue;
      const state = String(row._id.status),
        currency = String(row._id.currency);
      summary.counts[state] =
        (summary.counts[state] ?? 0) + Number(row.count ?? 0);
      if (["APPROVED", "IMPORTED"].includes(state))
        summary.approvedTotals[currency] =
          Math.round(
            ((summary.approvedTotals[currency] ?? 0) +
              Number(row.amount ?? 0)) *
              100,
          ) / 100;
    }
    const total =
      isRecord(countResult) && typeof countResult.n === "number"
        ? countResult.n
        : rows.length;

    return NextResponse.json({
      transactions: rows.map(serialize),
      summary,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("[bank-transfers] failed to list transactions", error);
    return NextResponse.json(
      { error: "Failed to list bank transfer transactions" },
      { status: 500 },
    );
  }
}
