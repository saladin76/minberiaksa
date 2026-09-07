/**
 * Marketing recommendation rules. Combines site donation data with platform
 * snapshots when present. Falls back to site-only rules when no spend / no
 * snapshot data is available — never produces CPA / ROAS suggestions for
 * groups without spend.
 *
 * Distinct from `lib/ads/recommendations.ts` which only sees site-data
 * `BreakdownRow`s. This module reads `ReconcileRow`s.
 */
import type { ReconcileRow } from "./reconcile";

export type MarketingRecommendationKind =
  // paid ads
  | "increase_budget"
  | "decrease_budget"
  | "tracking_alert"
  | "platform_under_credits"
  | "high_spend_low_conv"
  | "promising_market"
  // messaging
  | "messaging_low_delivery"
  | "messaging_low_click_rate"
  | "messaging_clicks_no_donation"
  | "messaging_high_cost_low_donation"
  | "messaging_promising_segment"
  | "messaging_template_needs_improvement";

export type MarketingRecommendationSeverity = "positive" | "warning" | "info";

export interface MarketingRecommendation {
  id: string;
  kind: MarketingRecommendationKind;
  severity: MarketingRecommendationSeverity;
  title: string;
  body: string;
  target?: {
    type: "platform" | "campaign" | "ad_group" | "ad" | "placement" | "country" | "channel";
    key: string;
    label: string;
  };
  metrics?: { label: string; value: string }[];
}

function fmtMoney(n: number | null): string {
  if (n == null) return "غير متاح";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
function fmtPct(n: number | null): string {
  if (n == null) return "غير متاح";
  return `${(n * 100).toFixed(1)}%`;
}

function targetFromRow(row: ReconcileRow): MarketingRecommendation["target"] | undefined {
  if (row.adId) return { type: "ad", key: row.adId, label: row.adName ?? row.adId };
  if (row.adGroupId) return { type: "ad_group", key: row.adGroupId, label: row.adGroupName ?? row.adGroupId };
  if (row.campaignId) return { type: "campaign", key: row.campaignId, label: row.campaignName ?? row.campaignId };
  if (row.country) return { type: "country", key: row.country, label: row.country };
  if (row.placement) return { type: "placement", key: row.placement, label: row.placement };
  if (row.channel) return { type: "channel", key: row.channel, label: row.channel };
  if (row.platform) return { type: "platform", key: row.platform, label: row.platform };
  return undefined;
}

export function computeMarketingRecommendations(rows: ReconcileRow[]): MarketingRecommendation[] {
  const out: MarketingRecommendation[] = [];

  for (const r of rows) {
    const target = targetFromRow(r);
    const targetKey = target?.key ?? "global";

    // ── PAID ADS rules — require platform data (spend) for spend-based ones
    if (r.spend != null && r.spend > 0) {
      // increase budget: strong real ROAS + healthy tracking + meaningful revenue
      if (
        r.roas != null &&
        r.roas >= 2 &&
        r.trackingHealth >= 0.7 &&
        r.siteRevenue >= 100
      ) {
        out.push({
          id: `inc_${targetKey}`,
          kind: "increase_budget",
          severity: "positive",
          title: "زود الصرف هنا",
          body: "إنفاق يحقق عائد قوي مع ثقة تتبع جيدة — مرشح لزيادة الميزانية.",
          target,
          metrics: [
            { label: "إنفاق", value: fmtMoney(r.spend) },
            { label: "إيراد الموقع", value: fmtMoney(r.siteRevenue) },
            { label: "ROAS الحقيقي", value: r.roas.toFixed(2) },
          ],
        });
      }
      // decrease budget: high spend + low donations
      if (r.spend >= 100 && r.sitePaidDonations <= 1) {
        out.push({
          id: `dec_${targetKey}`,
          kind: "decrease_budget",
          severity: "warning",
          title: "قلل الصرف هنا",
          body: "إنفاق كبير بدون تبرعات تقريبًا — راجع المحتوى أو الجمهور أو أوقف الحملة.",
          target,
          metrics: [
            { label: "إنفاق", value: fmtMoney(r.spend) },
            { label: "تبرعات الموقع", value: String(r.sitePaidDonations) },
          ],
        });
      }
      // high spend low conv (between the two extremes)
      if (r.spend >= 50 && r.cpa != null && r.cpa >= 100) {
        out.push({
          id: `cpa_${targetKey}`,
          kind: "high_spend_low_conv",
          severity: "warning",
          title: "إنفاق عالي وتحويل منخفض",
          body: "تكلفة كل تبرع مرتفعة جدًا — افحص صفحة الهبوط، وسيلة الدفع، أو جودة الجمهور.",
          target,
          metrics: [
            { label: "CPA", value: fmtMoney(r.cpa) },
            { label: "إنفاق", value: fmtMoney(r.spend) },
          ],
        });
      }
    }

    // tracking alert: site has donations but no platform attribution OR low confidence
    if (
      r.sitePaidDonations >= 3 &&
      r.platformReportedConversions != null &&
      r.platformReportedConversions === 0
    ) {
      out.push({
        id: `track_${targetKey}`,
        kind: "platform_under_credits",
        severity: "info",
        title: "أداء قوي لكن المنصة لا تنسبه",
        body: "هناك تبرعات حقيقية لكن المنصة لم تسجّل أي تحويل — على الأرجح ضعف click ID أو CAPI.",
        target,
        metrics: [
          { label: "تبرعات الموقع", value: String(r.sitePaidDonations) },
          { label: "ثقة", value: fmtPct(r.trackingHealth) },
        ],
      });
    }
    if (r.sitePaidDonations >= 5 && r.trackingHealth < 0.5) {
      out.push({
        id: `track_low_${targetKey}`,
        kind: "tracking_alert",
        severity: "warning",
        title: "يحتاج فحص تتبع",
        body: "ثقة التتبع منخفضة رغم وجود تبرعات — راجع UTMs و click IDs و CAPI.",
        target,
        metrics: [
          { label: "ثقة", value: fmtPct(r.trackingHealth) },
          { label: "تبرعات الموقع", value: String(r.sitePaidDonations) },
        ],
      });
    }

    // promising market — country with high revenue share + healthy CPA when spend known
    if (
      r.country &&
      r.sitePaidDonations >= 3 &&
      r.siteRevenue >= 200 &&
      (r.spend == null || r.cpa == null || r.cpa <= 80)
    ) {
      out.push({
        id: `promising_country_${targetKey}`,
        kind: "promising_market",
        severity: "positive",
        title: "دولة واعدة",
        body: "تبرعات قوية بتكلفة معقولة — فكر في زيادة الاستهداف لهذه الدولة.",
        target,
        metrics: [
          { label: "إيراد الموقع", value: fmtMoney(r.siteRevenue) },
          { label: "تبرعات", value: String(r.sitePaidDonations) },
        ],
      });
    }

    // ── MESSAGING rules
    if (r.sent != null && r.sent >= 50) {
      const deliveryRate = r.sent > 0 ? (r.delivered ?? 0) / r.sent : 0;
      const clickRate = (r.delivered ?? 0) > 0 ? (r.clicked ?? 0) / (r.delivered ?? 1) : 0;
      const failureRate = (r.failed ?? 0) / r.sent;
      if (failureRate >= 0.2) {
        out.push({
          id: `msg_fail_${targetKey}`,
          kind: "messaging_low_delivery",
          severity: "warning",
          title: "معدل تسليم منخفض",
          body: "أكثر من 20٪ من الرسائل فشلت — راجع جودة قائمة الأرقام أو أهلية القناة.",
          target,
          metrics: [
            { label: "فشل", value: fmtPct(failureRate) },
            { label: "مُرسل", value: String(r.sent) },
          ],
        });
      }
      if (deliveryRate >= 0.85 && clickRate <= 0.03) {
        out.push({
          id: `msg_click_${targetKey}`,
          kind: "messaging_low_click_rate",
          severity: "warning",
          title: "معدل نقر منخفض",
          body: "وصلت الرسالة لكن قليل من المستلمين ضغطوا الزر — جرب جملة افتتاحية أو CTA أقوى.",
          target,
          metrics: [
            { label: "نقر", value: fmtPct(clickRate) },
            { label: "تسليم", value: fmtPct(deliveryRate) },
          ],
        });
      }
      if ((r.clicked ?? 0) >= 5 && r.sitePaidDonations === 0) {
        out.push({
          id: `msg_no_don_${targetKey}`,
          kind: "messaging_clicks_no_donation",
          severity: "warning",
          title: "نقرات بدون تبرع",
          body: "نقر مرتفع بدون تبرع واحد — افحص صفحة الهبوط أو مسار الدفع.",
          target,
          metrics: [
            { label: "نقرات", value: String(r.clicked) },
            { label: "تبرعات", value: String(r.sitePaidDonations) },
          ],
        });
      }
      if (r.spend != null && r.spend > 0 && r.cpa != null && r.cpa >= 50 && r.sitePaidDonations < 5) {
        out.push({
          id: `msg_cost_${targetKey}`,
          kind: "messaging_high_cost_low_donation",
          severity: "warning",
          title: "تكلفة عالية وتبرعات منخفضة",
          body: "الإنفاق على الرسائل لم يجلب عددًا كافيًا من التبرعات.",
          target,
          metrics: [
            { label: "CPA", value: fmtMoney(r.cpa) },
            { label: "تبرعات", value: String(r.sitePaidDonations) },
          ],
        });
      }
      if (
        r.sitePaidDonations >= 5 &&
        (r.spend == null || r.cpa == null || r.cpa <= 30)
      ) {
        out.push({
          id: `msg_segment_${targetKey}`,
          kind: "messaging_promising_segment",
          severity: "positive",
          title: "شريحة واعدة",
          body: "هذه الشريحة/القناة تجلب تبرعات بتكلفة منخفضة — كرر التركيز عليها.",
          target,
          metrics: [
            { label: "تبرعات", value: String(r.sitePaidDonations) },
            { label: "إيراد", value: fmtMoney(r.siteRevenue) },
          ],
        });
      }
    }
  }

  return out.slice(0, 16);
}
