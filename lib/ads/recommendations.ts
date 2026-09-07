/**
 * Site-data-only recommendation engine for the Ads Intelligence dashboard.
 * Rules-based and conservative — we don't have platform spend yet, so we
 * never compute CPA/ROAS. Each rule produces a typed card the UI can render
 * with an Arabic title + body.
 *
 * Designed to be additive: a future Marketing Intelligence module can call
 * `computeRecommendations` with spend data and we just append spend-based
 * rules without changing the existing ones.
 */
import type { BreakdownRow } from "@/lib/attribution/aggregate";

export type RecommendationKind =
  | "increase_budget"
  | "decrease_budget"
  | "investigate_tracking"
  | "platform_under_credits"
  | "high_spend_low_conv"
  | "promising_market";

export type RecommendationSeverity = "positive" | "warning" | "info";

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  severity: RecommendationSeverity;
  title: string;
  /** Short Arabic-friendly description of WHY this suggestion fires. */
  body: string;
  /** Optional target — what entity should the operator look at? */
  target?: {
    type: "platform" | "campaign" | "ad" | "country" | "placement";
    key: string;
    label: string;
  };
  /** Optional supporting metrics shown as a chip. */
  metrics?: { label: string; value: string }[];
}

export interface RecommendationsInput {
  platforms: BreakdownRow[];
  campaigns: BreakdownRow[];
  ads: BreakdownRow[];
  countries: BreakdownRow[];
  placements: BreakdownRow[];
  totalRevenueUSD: number;
  paidAdCount: number;
}

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function computeRecommendations(
  input: RecommendationsInput
): Recommendation[] {
  const out: Recommendation[] = [];

  // Rule 1 — INCREASE BUDGET: ads with strong tracking + high success rate
  // and meaningful revenue share. We use a relative cutoff so the rule still
  // fires on small windows.
  if (input.totalRevenueUSD > 0) {
    const candidates = [...input.ads]
      .filter(
        (r) =>
          r.paidCount >= 3 &&
          r.avgConfidence >= 70 &&
          r.paymentSuccessRate >= 0.5 &&
          r.revenueShare >= 0.05
      )
      .sort((a, b) => b.revenueUSD - a.revenueUSD)
      .slice(0, 3);
    for (const r of candidates) {
      out.push({
        id: `inc_budget_ad_${r.key}`,
        kind: "increase_budget",
        severity: "positive",
        title: "زود الصرف هنا",
        body: "إعلان بإيرادات عالية وثقة تتبع جيدة ومعدل دفع ناجح — مرشح لزيادة الميزانية.",
        target: {
          type: "ad",
          key: r.key,
          label: r.label,
        },
        metrics: [
          { label: "إيرادات", value: fmtMoney(r.revenueUSD) },
          { label: "ثقة", value: `${Math.round(r.avgConfidence)}%` },
          { label: "نجاح الدفع", value: fmtPct(r.paymentSuccessRate) },
        ],
      });
    }
  }

  // Rule 2 — DECREASE BUDGET: ads with high failed-attempt ratio and almost
  // no revenue. We require at least some volume so noise rows don't surface.
  for (const r of input.ads) {
    if (r.totalAttempts < 5) continue;
    if (r.paidCount > 0 && r.paymentSuccessRate >= 0.3) continue;
    if (r.failedCount < 4) continue;
    out.push({
      id: `dec_budget_ad_${r.key}`,
      kind: "decrease_budget",
      severity: "warning",
      title: "قلل الصرف هنا",
      body: "إعلان به محاولات فاشلة كثيرة وقليل من التبرعات الناجحة — يستهلك ميزانية بلا عائد.",
      target: { type: "ad", key: r.key, label: r.label },
      metrics: [
        { label: "محاولات", value: String(r.totalAttempts) },
        { label: "فاشلة", value: String(r.failedCount) },
        { label: "نجاح الدفع", value: fmtPct(r.paymentSuccessRate) },
      ],
    });
    if (out.filter((r) => r.kind === "decrease_budget").length >= 3) break;
  }

  // Rule 3 — INVESTIGATE TRACKING: campaign with many donations but
  // confidence is in the utm_only / ga4_inferred range.
  for (const r of input.campaigns) {
    if (r.paidCount < 5) continue;
    if (r.avgConfidence === 0) continue; // organic — not a tracking failure
    if (r.avgConfidence >= 70) continue;
    out.push({
      id: `inv_track_camp_${r.key}`,
      kind: "investigate_tracking",
      severity: "warning",
      title: "يحتاج فحص تتبع",
      body: "الحملة تجلب تبرعات لكن متوسط الثقة منخفض — راجع UTMs أو click IDs أو CAPI.",
      target: { type: "campaign", key: r.key, label: r.label },
      metrics: [
        { label: "تبرعات", value: String(r.paidCount) },
        { label: "ثقة", value: `${Math.round(r.avgConfidence)}%` },
      ],
    });
    if (out.filter((r) => r.kind === "investigate_tracking").length >= 3) break;
  }

  // Rule 4 — PLATFORM_UNDER_CREDITS: a platform we attribute revenue to but
  // average confidence is below 60 — meaning the platform's own dashboard
  // will not see most of our conversions. Suggests fixing pixel/CAPI hookup.
  for (const r of input.platforms) {
    if (r.platform === "organic") continue;
    if (r.paidCount < 3) continue;
    if (r.avgConfidence === 0 || r.avgConfidence >= 60) continue;
    out.push({
      id: `under_credit_${r.key}`,
      kind: "platform_under_credits",
      severity: "info",
      title: "أداء قوي لكن المنصة لا تنسبه",
      body: "تبرعات حقيقية على هذه المنصة، لكن ضعف الـ click IDs أو CAPI يعني أن لوحة المنصة لن ترى معظمها.",
      target: { type: "platform", key: r.key, label: r.label },
      metrics: [
        { label: "إيرادات", value: fmtMoney(r.revenueUSD) },
        { label: "ثقة", value: `${Math.round(r.avgConfidence)}%` },
      ],
    });
  }

  // Rule 5 — HIGH SPEND LOW CONV: many attempts (clicks reaching donation
  // page) but very low paid conversion. We can't see real spend yet, but
  // attempts is a decent proxy for landing-page traffic.
  for (const r of input.campaigns) {
    if (r.totalAttempts < 20) continue;
    if (r.paymentSuccessRate >= 0.25) continue;
    out.push({
      id: `high_attempts_low_conv_${r.key}`,
      kind: "high_spend_low_conv",
      severity: "warning",
      title: "إنفاق عالي وتحويل منخفض",
      body: "محاولات كثيرة لكن قليل منها يتحول لتبرع مدفوع — افحص صفحة الهبوط أو وسيلة الدفع.",
      target: { type: "campaign", key: r.key, label: r.label },
      metrics: [
        { label: "محاولات", value: String(r.totalAttempts) },
        { label: "نجاح الدفع", value: fmtPct(r.paymentSuccessRate) },
      ],
    });
    if (out.filter((r) => r.kind === "high_spend_low_conv").length >= 3) break;
  }

  // Rule 6 — PROMISING MARKET: country with above-average revenue share and
  // high payment success rate. Cap to top 3.
  const countryCandidates = [...input.countries]
    .filter(
      (r) =>
        r.key !== "__unset" &&
        r.paidCount >= 3 &&
        r.paymentSuccessRate >= 0.5 &&
        r.revenueShare >= 0.05
    )
    .sort((a, b) => b.revenueUSD - a.revenueUSD)
    .slice(0, 3);
  for (const r of countryCandidates) {
    out.push({
      id: `promising_country_${r.key}`,
      kind: "promising_market",
      severity: "positive",
      title: "دولة واعدة",
      body: "إيرادات عالية ومعدل دفع ناجح في هذه الدولة — فكر في زيادة الاستهداف أو ترجمة محتوى مخصص.",
      target: { type: "country", key: r.key, label: r.label },
      metrics: [
        { label: "إيرادات", value: fmtMoney(r.revenueUSD) },
        { label: "حصة", value: fmtPct(r.revenueShare) },
        { label: "نجاح الدفع", value: fmtPct(r.paymentSuccessRate) },
      ],
    });
  }
  // Same for placements — a good placement is a high-ROI opportunity even without country.
  const placementCandidates = [...input.placements]
    .filter((r) => r.paidCount >= 3 && r.revenueShare >= 0.05)
    .sort((a, b) => b.revenueUSD - a.revenueUSD)
    .slice(0, 2);
  for (const r of placementCandidates) {
    out.push({
      id: `promising_placement_${r.key}`,
      kind: "promising_market",
      severity: "positive",
      title: "موضع واعد",
      body: "موضع يجلب تبرعات قوية — فكر في زيادة التخصيص لهذا الموضع.",
      target: { type: "placement", key: r.key, label: r.label },
      metrics: [
        { label: "إيرادات", value: fmtMoney(r.revenueUSD) },
        { label: "حصة", value: fmtPct(r.revenueShare) },
      ],
    });
  }

  // Limit to a sensible total so the UI stays scannable.
  return out.slice(0, 12);
}
