import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { fetchAdsDonations } from "@/lib/admin/ads-fetch";
import { buildDiagnosticRows } from "@/lib/attribution/aggregate";
import type { AttributionStatus } from "@/lib/tracking/tracking-event-contract";

const ALL_STATUSES: AttributionStatus[] = [
  "verified",
  "strong",
  "likely_paid",
  "ga4_inferred",
  "utm_only",
  "organic",
  "direct",
  "tracking_issue",
];

type IssueBucket =
  | "capi_missing"
  | "browser_missing"
  | "click_id_missing"
  | "unresolved_macros"
  | "ga4_missing"
  | "utm_only"
  | "organic_or_direct"
  | "tracking_issue";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "ads");
    if (denied) return denied;

    const sp = request.nextUrl.searchParams;
    const onlyIssues = sp.get("onlyIssues") !== "false"; // default true
    const statusFilter = sp.get("status") as AttributionStatus | null;
    const issueFilter = sp.get("issue") as IssueBucket | null;
    const platformFilter = sp.get("platform");
    const minConfRaw = sp.get("minConfidence");
    const maxConfRaw = sp.get("maxConfidence");
    const minConfidence = minConfRaw ? Math.max(0, Math.min(100, Number(minConfRaw))) : null;
    const maxConfidence = maxConfRaw ? Math.max(0, Math.min(100, Number(maxConfRaw))) : null;

    const { donations, range } = await fetchAdsDonations({
      period: sp.get("period") || "month",
      startParam: sp.get("start"),
      endParam: sp.get("end"),
      categoryId: sp.get("categoryId"),
      campaignId: sp.get("campaignId"),
      country: sp.get("country"),
    });

    const { rows: detailRows, counts, issueCounts } = buildDiagnosticRows(donations);

    let filtered = detailRows;
    if (onlyIssues) filtered = filtered.filter((r) => r.hasIssue);
    if (statusFilter && ALL_STATUSES.includes(statusFilter)) {
      filtered = filtered.filter((r) => r.sourceStatus === statusFilter);
    }
    if (platformFilter && platformFilter !== "all") {
      filtered = filtered.filter((r) => r.platform === platformFilter);
    }
    if (minConfidence != null) {
      filtered = filtered.filter((r) => r.confidence >= minConfidence);
    }
    if (maxConfidence != null) {
      filtered = filtered.filter((r) => r.confidence <= maxConfidence);
    }
    if (issueFilter) {
      const codeMatchers: Record<IssueBucket, (codes: Set<string>) => boolean> = {
        capi_missing: (c) =>
          c.has("capi_donate_missing") || c.has("capi_donate_failed_only"),
        browser_missing: (c) => c.has("browser_donate_missing"),
        click_id_missing: (c) =>
          c.has("fbclid_or_fbc_missing") ||
          c.has("gclid_or_gbraid_missing") ||
          c.has("ttclid_missing") ||
          c.has("twclid_missing") ||
          c.has("utm_without_click_id"),
        unresolved_macros: (c) => c.has("dynamic_macro_unresolved"),
        ga4_missing: (c) =>
          c.has("ga4_client_or_session_missing") || c.has("ga4_purchase_missing"),
        utm_only: () => true, // handled below via status
        organic_or_direct: () => true, // handled below via status
        tracking_issue: () => true, // handled below via status
      };
      if (issueFilter === "utm_only") {
        filtered = filtered.filter((r) => r.sourceStatus === "utm_only");
      } else if (issueFilter === "organic_or_direct") {
        filtered = filtered.filter(
          (r) => r.sourceStatus === "organic" || r.sourceStatus === "direct"
        );
      } else if (issueFilter === "tracking_issue") {
        filtered = filtered.filter((r) => r.sourceStatus === "tracking_issue");
      } else {
        const matcher = codeMatchers[issueFilter];
        filtered = filtered.filter((r) => {
          const codes = new Set(r.reasons.map((rr) => rr.code));
          return matcher(codes);
        });
      }
    }

    // Newest issues first by paidAt fallback createdAt.
    filtered.sort((a, b) => {
      const at = a.paidAt ? Date.parse(a.paidAt) : Date.parse(a.createdAt);
      const bt = b.paidAt ? Date.parse(b.paidAt) : Date.parse(b.createdAt);
      return bt - at;
    });

    return NextResponse.json({
      counts,
      issueCounts,
      totalRows: detailRows.length,
      rows: filtered.slice(0, 500),
      truncated: filtered.length > 500,
      range: {
        startDateKey: range.startDateKey,
        endDateKey: range.endDateKey,
      },
    });
  } catch (error) {
    console.error("Error fetching ads diagnostics:", error);
    return NextResponse.json(
      { error: "Failed to fetch ads diagnostics" },
      { status: 500 }
    );
  }
}
