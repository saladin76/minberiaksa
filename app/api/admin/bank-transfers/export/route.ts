import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { statementRead } from "@/lib/bank-transfers/statement-import";

import {
  DASH_LOCALE_COOKIE,
  dt,
  parseDashLocale,
  setDashLocale,
} from "@/lib/dashboard/i18n";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "BankTransferTransaction";
const ALLOWED_STATUSES = new Set([
  "PENDING_REVIEW",
  "APPROVED",
  "IMPORTED",
  "IGNORED",
  "all",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mongoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.$date === "string") return value.$date;
  return "";
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function clean(value: string | null) {
  return value && value.trim() && value !== "all" ? value.trim() : null;
}

function num(value: string | null) {
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function regex(value: string) {
  return value.slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildFilter(url: URL) {
  const status = url.searchParams.get("status") ?? "all";
  const filter: Record<string, unknown> = {
    direction: "CREDIT",
    status: status === "all" ? { $nin: ["DUPLICATE", "DELETED"] } : status,
  };
  const bankId = clean(url.searchParams.get("bankId"));
  const currency = clean(url.searchParams.get("currency"));
  const donorLocale = clean(url.searchParams.get("donorLocale"));
  const project = clean(url.searchParams.get("project"));
  const q = clean(url.searchParams.get("q"));
  const dateFrom = clean(url.searchParams.get("dateFrom"));
  const dateTo = clean(url.searchParams.get("dateTo"));
  const amountMin = num(url.searchParams.get("amountMin"));
  const amountMax = num(url.searchParams.get("amountMax"));
  if (bankId) filter.bankId = bankId;
  if (currency) filter.currency = currency;
  if (donorLocale) filter.donorLocale = donorLocale;
  if (project) filter.finalProject = { $regex: regex(project), $options: "i" };
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
  // Column headers and labels in the dashboard's interface language.
  setDashLocale(
    parseDashLocale(request.cookies.get(DASH_LOCALE_COOKIE)?.value),
  );
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "bankTransfers");
    if (denied) return denied;

    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "all";
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const sortFields = new Set([
      "createdAt",
      "transactionDate",
      "amount",
      "donorName",
      "bankId",
      "status",
      "donorLocale",
      "finalProject",
    ]);
    const requestedSort = url.searchParams.get("sortBy") ?? "createdAt";
    const sortBy = sortFields.has(requestedSort) ? requestedSort : "createdAt";
    const rows = await statementRead(
      prisma,
      COLLECTION,
      buildFilter(url),
      { raw: 0 },
      {
        sort: {
          [sortBy]: url.searchParams.get("sortDir") === "asc" ? 1 : -1,
          _id: -1,
        },
        limit: 10001,
      },
    );
    if (rows.length > 10000)
      return NextResponse.json(
        {
          error: dt("النتائج تتجاوز 10000 حركة. ضيّق التصفية ثم أعد التصدير."),
          code: "EXPORT_LIMIT_EXCEEDED",
        },
        { status: 422 },
      );

    const XLSX = await import("xlsx");
    const sheetRows = rows.map((row) => ({
      [dt("تاريخ العملية")]: text(row.transactionDate),
      [dt("التاريخ والوقت")]: text(row.transactionAt),
      [dt("اسم المتبرع")]: text(row.donorName),
      [dt("القيمة")]:
        typeof row.amount === "number" ? row.amount : text(row.amount),
      [dt("العملة")]: text(row.currency),
      [dt("الرصيد")]:
        typeof row.balance === "number" ? row.balance : text(row.balance),
      [dt("القناة")]: text(row.channel),
      [dt("لغة المتبرع")]: text(row.donorLocale),
      [dt("البنك")]: text(row.bankId),
      IBAN: text(row.bankIban),
      [dt("الحالة")]: text(row.status),
      [dt("المشروع")]: text(
        row.finalProject ?? row.suggestedProject ?? dt("تبرع عام"),
      ),
      [dt("المرجع")]: text(row.reference),
      [dt("الوصف")]: text(row.description),
      [dt("تاريخ الإدخال")]: mongoDate(row.createdAt),
    }));
    const worksheet = XLSX.utils.json_to_sheet(sheetRows);
    worksheet["!cols"] = [
      { wch: 14 },
      { wch: 24 },
      { wch: 24 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 16 },
      { wch: 12 },
      { wch: 24 },
      { wch: 28 },
      { wch: 14 },
      { wch: 22 },
      { wch: 20 },
      { wch: 55 },
      { wch: 22 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bank Transfers");
    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    }) as Buffer;

    const fileName = `bank-transfers-${status}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[bank-transfers] export failed", error);
    return NextResponse.json(
      { error: "Failed to export bank transfers" },
      { status: 500 },
    );
  }
}
