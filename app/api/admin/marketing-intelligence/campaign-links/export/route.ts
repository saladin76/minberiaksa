import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  listCampaignLinks,
  parseCampaignLinkStatusFilter,
  readString,
  type CampaignLinkRecord,
} from "@/lib/marketing/campaign-links/campaign-link-registry-service";

export const dynamic = "force-dynamic";
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function cell(value: unknown) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function matchesSearch(row: CampaignLinkRecord, search: string) {
  if (!search) return true;
  return [row.name, row.platform, row.channel, row.url, row.campaignId, row.adsetId, row.adGroupId, row.adId, row.utmCampaign, row.targetCountry, row.objective, row.internalNotes].map(text).join(" ").toLowerCase().includes(search);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "referrals");
  if (denied) return denied;
  const platform = readString(request.nextUrl.searchParams.get("platform"));
  const status = parseCampaignLinkStatusFilter(request.nextUrl.searchParams.get("status"));
  const search = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
  const links = await listCampaignLinks({ limit: 1000, platform: platform === "ALL" ? null : platform, status });
  const filtered = links.filter((row) => matchesSearch(row, search));
  const header = ["name", "status", "platform", "channel", "campaignId", "adsetId", "adGroupId", "adId", "utmCampaign", "targetCountry", "objective", "saveCount", "url", "internalNotes", "createdAt", "updatedAt"];
  const lines = [header.map(cell).join(",")];
  for (const row of filtered) lines.push([row.name, row.status, row.platform, row.channel, row.campaignId, row.adsetId, row.adGroupId, row.adId, row.utmCampaign, row.targetCountry, row.objective, row.saveCount || 0, row.url, row.internalNotes, row.createdAt, row.updatedAt].map(cell).join(","));
  const csv = `\uFEFF${lines.join("\n")}`;
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="campaign-links-${Date.now()}.csv"`, "Cache-Control": "no-store" } });
}
