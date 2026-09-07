import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

export const dynamic = "force-dynamic";

type JsonMap = Record<string, unknown>;

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current.trim());
      current = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function keyOf(value: string) {
  return value.trim().toLowerCase().replace(/[\s_\-.]+/g, "");
}

function pick(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[keyOf(key)];
    if (value != null && value !== "") return value;
  }
  return "";
}

function num(value: string) {
  const cleaned = value.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function spendValue(input: Record<string, string>) {
  const costMicros = pick(input, ["cost micros", "cost_micros", "metrics.cost_micros"]);
  if (costMicros) return num(costMicros) / 1_000_000;
  return num(pick(input, ["spend", "cost", "amount spent", "amount spent (usd)"]));
}

function dateValue(value: string) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function mapRow(input: Record<string, string>, defaults: JsonMap) {
  const platform = String(defaults.platform || pick(input, ["platform", "source", "publisher platform"]) || "META").toUpperCase();
  const level = String(defaults.level || pick(input, ["level", "reporting level"]) || "CAMPAIGN").toUpperCase();
  return {
    platform,
    level,
    date: dateValue(pick(input, ["date", "day", "date start", "date_start", "start date"])),
    accountId: pick(input, ["account id", "account_id", "customer id", "customer_id"]),
    accountName: pick(input, ["account name", "account_name", "customer name"]),
    campaignId: pick(input, ["campaign id", "campaign_id", "campaign.id"]),
    campaignName: pick(input, ["campaign name", "campaign_name", "campaign"]),
    adsetId: pick(input, ["adset id", "ad set id", "ad_group_id", "ad group id", "adgroup id"]),
    adsetName: pick(input, ["adset name", "ad set name", "ad_group_name", "ad group name", "adgroup name"]),
    adId: pick(input, ["ad id", "ad_id", "ad.id"]),
    adName: pick(input, ["ad name", "ad_name", "ad"]),
    source: pick(input, ["source", "session source", "utm_source"]),
    medium: pick(input, ["medium", "session medium", "utm_medium"]),
    currency: String(defaults.currency || pick(input, ["currency", "account currency"]) || "USD").toUpperCase(),
    spend: spendValue(input),
    impressions: num(pick(input, ["impressions", "impr."])),
    clicks: num(pick(input, ["clicks", "link clicks"])),
    conversions: num(pick(input, ["conversions", "purchases", "results", "website purchases", "purchase"])),
    revenue: num(pick(input, ["revenue", "conversion value", "purchase conversion value", "website purchase roas value", "purchase revenue", "total revenue"])),
    raw: input,
  };
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const body = await request.json().catch(() => ({})) as JsonMap;
  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv.trim()) return NextResponse.json({ ok: false, error: "missing csv" }, { status: 400 });

  const parsed = parseCsv(csv.replace(/^\uFEFF/, ""));
  if (parsed.length < 2) return NextResponse.json({ ok: false, error: "csv has no data rows" }, { status: 400 });

  const headers = parsed[0].map(keyOf);
  const defaults = {
    platform: body.platform,
    level: body.level,
    currency: body.currency,
  };

  const rows = parsed.slice(1).map((cells) => {
    const input: Record<string, string> = {};
    headers.forEach((header, index) => { input[header] = cells[index] || ""; });
    return mapRow(input, defaults);
  }).filter((row) => row.spend > 0 || row.impressions > 0 || row.clicks > 0 || row.conversions > 0 || row.revenue > 0);

  if (rows.length === 0) return NextResponse.json({ ok: false, error: "no importable metric rows" }, { status: 400 });

  const origin = request.nextUrl.origin;
  const res = await fetch(`${origin}/api/admin/marketing-intelligence/platform-metrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") || "" },
    body: JSON.stringify({ rows }),
    cache: "no-store",
  });
  const result = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json({ ok: false, error: "platform metrics import failed", details: result }, { status: 500 });

  return NextResponse.json({ ok: true, imported: rows.length, skipped: parsed.length - 1 - rows.length, result });
}
