/**
 * Dashboard donation exporter.
 *
 * Produces either a structured XLSX workbook (multiple sheets, formatted
 * columns, frozen header, auto-filter) or a CSV with the same data plus a
 * summary block at the end.
 *
 * Financial separation:
 *   - "amount" column is the base donation only  what the donor pledged to
 *     the cause. Team support and processing fees are intentionally NOT folded
 *     in so the finance team can split operating costs from cause funds.
 *   - "teamSupport" is the donor's extra contribution to running the platform.
 *   - "fees" is the processing fee the donor opted to cover.
 *   - "totalAmount" is what was actually charged (amount + teamSupport + fees
 *     if coverFees was on).
 *
 * Every total in the summary block is reported as both the per-currency local
 * value (for accounting) and the USD value (for cross-currency comparison).
 */

import ExcelJS from "exceljs";
import { dashDir, dashIntl, dt, withReportLanguage } from "@/lib/dashboard/report-i18n";
import { exportCountryName, exportLanguageName, exportPaymentMethod, exportPaymentStatus } from "@/lib/dashboard/export-labels";

// ─── Public types ─────────────────────────────────────────────────────────────

export type ExportFormat = "xlsx" | "csv";

/** Plan cadence as stored on `Subscription.frequency`. */
export type ExportRecurringFrequency = "DAILY" | "FRIDAY" | "MONTHLY";

const FREQUENCY_LABEL_AR: Record<ExportRecurringFrequency, string> = {
  get DAILY() { return dt("يومي"); },
  get FRIDAY() { return dt("تبرع كل جمعة"); },
  get MONTHLY() { return dt("شهري"); },
};

export interface DonationExportRow {
  id: string;
  status: string;
  /** MONTHLY = charged against any recurring plan (the name predates daily / Friday plans). */
  type: "ONE_TIME" | "MONTHLY";
  /** The plan's cadence, when the exporter knows it. */
  frequency?: ExportRecurringFrequency | null;
  createdAt: Date;
  paidAt: Date | null;
  donor: {
    id: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    countryCode: string | null;
  };
  donorCountryCode: string | null;
  locale: string | null;
  currency: string;
  amount: number;          // base donation
  amountUSD: number | null;
  teamSupport: number;
  fees: number;
  totalAmount: number;     // amount + teamSupport + fees (if coverFees)
  coverFees: boolean;
  projectAllocations?: { id: string; title: string; amount: number }[];
  campaigns: { id: string; title: string }[];
  categories: { id: string; name: string }[];
  referral: { id: string; code: string | null; name: string | null } | null;
  paymentMethod: string | null;
  provider: string | null;
  providerOrderId: string | null;
  providerErrorMessage: string | null;
  subscriptionId: string | null;
  comment: string | null;
  attribution: Record<string, unknown> | null;
}

export interface SubscriptionExportRow {
  id: string;
  status: "ACTIVE" | "PAUSED" | "CANCELLED" | "PAYMENT_FAILED";
  frequency?: ExportRecurringFrequency | null;
  /** Per-charge USD amount on a monthly scale (daily ×30.44, Friday ×4.35). */
  monthlyEquivalentUSD?: number | null;
  donor: { id: string | null; name: string | null; email: string | null; phone: string | null; countryCode: string | null };
  amount: number;
  amountUSD: number | null;
  currency: string;
  teamSupport: number;
  paymentMethod: string | null;
  createdAt: Date;
  lastBillingDate: Date | null;
  nextBillingDate: Date | null;
  campaigns: { id: string; title: string }[];
  categories: { id: string; name: string }[];
  referral: { id: string; code: string | null; name: string | null } | null;
  /** Count of confirmed PAID charges that have already happened on this subscription. */
  provider?: string | null;
  totalChargesMissingUSD?: number;
  reportChargesCount?: number;
  reportChargesAmount?: number;
  reportChargesUSD?: number;
  reportChargesMissingUSD?: number;
  totalChargesCount: number;
  /** Sum of amount across confirmed PAID charges (in subscription currency). */
  totalChargesAmount: number | null;
  /** Sum of amountUSD across confirmed PAID charges. */
  totalChargesAmountUSD: number;
}

export interface ExportFilterDescriptor {
  /** Human label, Arabic  appears on the "Filters Applied" section in the workbook. */
  label: string;
  value: string;
}

export interface DonationExportInput {
  language?: "ar" | "en";
  period?: { start?: Date; end?: Date };
  format: ExportFormat;
  /** Workbook / report title (e.g. "تقرير التبرعات", "تقرير الاشتراكات الشهرية"). */
  title: string;
  /** Optional sub-title (e.g. referral name, date range). */
  subtitle?: string;
  /** Captured filter values shown in the Filters Applied panel. */
  filters: ExportFilterDescriptor[];
  donations: DonationExportRow[];
  /** When set, an extra "Subscriptions" sheet is included (monthly export). */
  subscriptions?: SubscriptionExportRow[];
}

export interface ExportResult {
  /** Raw bytes (XLSX) or UTF-8 string-as-bytes (CSV) with BOM. */
  body: Buffer;
  contentType: string;
  /** ASCII-only filename  safe for the legacy `filename=` part of Content-Disposition. */
  filename: string;
  /** Human-friendly title (may contain Arabic)  emit as RFC 5987 `filename*=UTF-8''…`. */
  filenameUtf8: string;
}

// ─── Donation column schema ───────────────────────────────────────────────────

type Aligned = "left" | "right" | "center";
interface ColSpec<T> {
  key: keyof T | string;
  header: string;
  width: number;
  align?: Aligned;
  /** Excel number format. Currency columns use `0.00` (so the currency symbol
   *  lives in a sibling column  Excel can't natively format mixed currencies
   *  in one column, and we need the raw number for downstream pivots). */
  numFmt?: string;
  /** Optional cell formatter returning the value placed in the cell. */
  value: (r: T) => string | number | Date | null;
}

const DONATION_COLUMNS: ColSpec<DonationExportRow>[] = [
  { key: "id", get header() { return dt("رقم العملية"); }, width: 26, value: (r) => r.id },
  { key: "status", get header() { return dt("الحالة"); }, width: 16, align: "center", value: (r) => exportPaymentStatus(r.status, r.paidAt) },
  { key: "type", get header() { return dt("النوع"); }, width: 12, align: "center", value: (r) =>
    r.type !== "MONTHLY"
      ? dt("لمرة واحدة")
      : r.frequency
        ? dt("متكرر  {0}", [FREQUENCY_LABEL_AR[r.frequency]])
        : dt("متكرر") },
  { key: "createdAt", get header() { return dt("تاريخ الإنشاء"); }, width: 19, numFmt: "yyyy-mm-dd hh:mm", value: (r) => r.createdAt },
  { key: "paidAt", get header() { return dt("تاريخ الدفع"); }, width: 19, numFmt: "yyyy-mm-dd hh:mm", value: (r) => r.paidAt },
  { key: "donorName", get header() { return dt("اسم المتبرع"); }, width: 24, value: (r) => r.donor.name ?? "" },
  { key: "donorEmail", get header() { return dt("بريد المتبرع"); }, width: 28, value: (r) => r.donor.email ?? "" },
  { key: "donorPhone", get header() { return dt("هاتف المتبرع"); }, width: 18, value: (r) => r.donor.phone ?? "" },
  { key: "country", get header() { return dt("الدولة"); }, width: 28, value: (r) => exportCountryName(r.donorCountryCode?.trim() || r.donor.countryCode) },
  { key: "locale", get header() { return dt("اللغة"); }, width: 18, value: (r) => exportLanguageName(r.locale) },
  { key: "currency", get header() { return dt("العملة"); }, width: 10, align: "center", value: (r) => r.currency },
  { key: "amount", get header() { return dt("مبلغ التبرع"); }, width: 14, align: "right", numFmt: "#,##0.00", value: (r) => r.amount },
  { key: "teamSupport", get header() { return dt("دعم الفريق"); }, width: 14, align: "right", numFmt: "#,##0.00", value: (r) => r.teamSupport },
  { key: "fees", get header() { return dt("رسوم المعالجة"); }, width: 14, align: "right", numFmt: "#,##0.00", value: (r) => r.fees },
  { key: "totalAmount", get header() { return dt("إجمالي العملية"); }, width: 18, align: "right", numFmt: "#,##0.00", value: (r) => r.totalAmount },
  { key: "amountUSD", get header() { return dt("بالدولار (USD)"); }, width: 14, align: "right", numFmt: "#,##0.00", value: (r) => r.amountUSD },
  { key: "coverFees", get header() { return dt("غطى الرسوم"); }, width: 12, align: "center", value: (r) => (r.coverFees ? dt("نعم") : dt("لا")) },
  { key: "campaigns", get header() { return dt("الحملات"); }, width: 36, value: (r) => r.campaigns.map((c) => c.title).join(dt("؛ ")) },
  { key: "categories", get header() { return dt("الأقسام"); }, width: 28, value: (r) => r.categories.map((c) => c.name).join(dt("؛ ")) },
  { key: "referralCode", get header() { return dt("رمز الإحالة"); }, width: 14, align: "center", value: (r) => r.referral?.code ?? "" },
  { key: "referralName", get header() { return dt("اسم الإحالة"); }, width: 24, value: (r) => r.referral?.name ?? "" },
  { key: "paymentMethod", get header() { return dt("وسيلة الدفع"); }, width: 18, align: "center", value: (r) => exportPaymentMethod(r.paymentMethod) },
  { key: "provider", get header() { return dt("بوابة الدفع"); }, width: 14, align: "center", value: (r) => r.provider ?? "" },
  { key: "providerOrderId", get header() { return dt("مرجع البوابة"); }, width: 24, value: (r) => r.providerOrderId ?? "" },
  { key: "providerErrorMessage", get header() { return dt("سبب الفشل"); }, width: 30, value: (r) => r.providerErrorMessage ?? "" },
  { key: "subscriptionId", get header() { return dt("رقم الاشتراك"); }, width: 26, value: (r) => r.subscriptionId ?? "" },
  { key: "comment", get header() { return dt("ملاحظة"); }, width: 28, value: (r) => r.comment ?? "" },
];

const SUBSCRIPTION_COLUMNS: ColSpec<SubscriptionExportRow>[] = [
  { key: "id", get header() { return dt("رقم الاشتراك"); }, width: 26, value: (r) => r.id },
  { key: "status", get header() { return dt("الحالة"); }, width: 12, align: "center", value: (r) => r.status === "ACTIVE" ? dt("نشط") : r.status === "PAUSED" ? dt("متوقف") : r.status === "PAYMENT_FAILED" ? dt("تعذّر الخصم") : dt("ملغي") },
  { key: "frequency", get header() { return dt("الدورية"); }, width: 12, align: "center", value: (r) => FREQUENCY_LABEL_AR[r.frequency ?? "MONTHLY"] },
  { key: "donorName", get header() { return dt("اسم المتبرع"); }, width: 24, value: (r) => r.donor.name ?? "" },
  { key: "donorEmail", get header() { return dt("بريد المتبرع"); }, width: 28, value: (r) => r.donor.email ?? "" },
  { key: "donorPhone", get header() { return dt("هاتف المتبرع"); }, width: 18, value: (r) => r.donor.phone ?? "" },
  { key: "country", get header() { return dt("الدولة"); }, width: 28, value: (r) => exportCountryName(r.donor.countryCode) },
  { key: "currency", get header() { return dt("العملة"); }, width: 10, align: "center", value: (r) => r.currency },
  { key: "amount", get header() { return dt("قيمة الدورة"); }, width: 14, align: "right", numFmt: "#,##0.00", value: (r) => r.amount },
  { key: "teamSupport", get header() { return dt("دعم الفريق"); }, width: 14, align: "right", numFmt: "#,##0.00", value: (r) => r.teamSupport },
  { key: "amountUSD", get header() { return dt("بالدولار (USD)"); }, width: 14, align: "right", numFmt: "#,##0.00", value: (r) => r.amountUSD },
  { key: "monthlyEquivalentUSD", get header() { return dt("المكافئ الشهري (USD)"); }, width: 18, align: "right", numFmt: "#,##0.00", value: (r) => r.status === "ACTIVE" && r.totalChargesCount > 0 ? r.monthlyEquivalentUSD ?? null : null },
  { key: "totalChargesCount", get header() { return dt("دفعات ناجحة طوال المدة"); }, width: 18, align: "center", numFmt: "#,##0", value: (r) => r.totalChargesCount },
  { key: "totalChargesAmount", get header() { return dt("أصل التبرعات طوال المدة (محلي)"); }, width: 18, align: "right", numFmt: "#,##0.00", value: (r) => r.totalChargesAmount },
  { key: "totalChargesAmountUSD", get header() { return dt("المحصّل طوال المدة (USD)"); }, width: 18, align: "right", numFmt: "#,##0.00", value: (r) => r.totalChargesAmountUSD },
  { key: "paymentMethod", get header() { return dt("وسيلة الدفع"); }, width: 18, align: "center", value: (r) => exportPaymentMethod(r.paymentMethod) },
  { key: "createdAt", get header() { return dt("تاريخ الإنشاء"); }, width: 19, numFmt: "yyyy-mm-dd hh:mm", value: (r) => r.createdAt },
  { key: "lastBillingDate", get header() { return dt("آخر دفعة"); }, width: 19, numFmt: "yyyy-mm-dd hh:mm", value: (r) => r.lastBillingDate },
  { key: "nextBillingDate", get header() { return dt("الدفعة القادمة"); }, width: 19, numFmt: "yyyy-mm-dd hh:mm", value: (r) => r.nextBillingDate },
  { key: "campaigns", get header() { return dt("الحملات"); }, width: 36, value: (r) => r.campaigns.map((c) => c.title).join(dt("؛ ")) },
  { key: "categories", get header() { return dt("الأقسام"); }, width: 28, value: (r) => r.categories.map((c) => c.name).join(dt("؛ ")) },
  { key: "referralCode", get header() { return dt("رمز الإحالة"); }, width: 14, align: "center", value: (r) => r.referral?.code ?? "" },
  { key: "referralName", get header() { return dt("اسم الإحالة"); }, width: 24, value: (r) => r.referral?.name ?? "" },
  { key: "provider", get header() { return dt("بوابة الدفع"); }, width: 20, value: r => r.provider ?? dt("غير محدد") },
  { key: "reportChargesCount", get header() { return dt("دفعات نتائج التقرير"); }, width: 20, numFmt: "#,##0", value: r => r.reportChargesCount ?? 0 },
  { key: "reportChargesAmount", get header() { return dt("محصّل نتائج التقرير"); }, width: 20, numFmt: "#,##0.00", value: r => r.reportChargesAmount ?? null },
  { key: "reportChargesUSD", get header() { return dt("المحصّل المعروف (USD)"); }, width: 20, numFmt: "#,##0.00", value: r => r.reportChargesUSD ?? 0 },
  { key: "reportChargesMissingUSD", get header() { return dt("دفعات التقرير بلا USD"); }, width: 20, value: r => r.reportChargesMissingUSD ?? 0 },
  { key: "activation", get header() { return dt("أول دفعة مؤكدة"); }, width: 20, value: r => r.totalChargesCount > 0 ? dt("نعم") : dt("لا") },
  { key: "totalChargesMissingUSD", get header() { return dt("دفعات بلا قيمة USD"); }, width: 20, value: r => r.totalChargesMissingUSD ?? 0 },
];

// ─── Aggregation ──────────────────────────────────────────────────────────────

interface PerCurrencyTotal {
  currency: string;
  count: number;
  donationAmount: number;     // base donation only
  teamSupport: number;
  fees: number;
  totalCharged: number;
  amountUSD: number;
}

interface PerBucketTotal {
  key: string;
  label: string;
  count: number;
  donationAmount: number;
  teamSupport: number;
  amountUSD: number;
}

interface Aggregates {
  totalCount: number;
  paidCount: number;
  failedCount: number;
  oneTimeCount: number;
  monthlyCount: number;
  totalAmountUSD: number;       // base donations only (paid), in USD
  totalTeamSupportUSD: number;  // team support (paid), in USD
  totalFeesUSD: number;
  totalChargedUSD: number;      // amount + teamSupport + fees, paid only
  failedAmountUSD: number;
  uniqueDonors: number;
  perCurrency: PerCurrencyTotal[];
  perCampaign: PerBucketTotal[];
  perCategory: PerBucketTotal[];
  perCountry: PerBucketTotal[];
  perStatus: PerBucketTotal[];
  perLocale: PerBucketTotal[];
  perProvider: PerBucketTotal[];
  perPaymentMethod: PerBucketTotal[];
  perReferral: PerBucketTotal[];
}

function ratio(localAmount: number, localTotal: number, amountUSD: number | null): number {
  if (!amountUSD || amountUSD === 0 || localTotal === 0) return 0;
  return (localAmount / localTotal) * amountUSD;
}

function aggregate(rows: DonationExportRow[]): Aggregates {
  // Must match PAID_DONATION_FILTER (lib/dashboard/donation-usd-revenue.ts), which the
  // on-screen cards use: settled donations only, one-time and subscription alike. Bare
  // `status === "PAID"` also counted abandoned checkouts that never settled, so the exported
  // workbook reported more successful donations  and more money  than the dashboard it was
  // exported from. Mirrors PAID_DONATION_FILTER; keep the two in step.
  const paid = rows.filter((r) => r.status === "PAID" && r.paidAt != null);

  const perCurrencyMap = new Map<string, PerCurrencyTotal>();
  const perCampaignMap = new Map<string, PerBucketTotal>();
  const perCategoryMap = new Map<string, PerBucketTotal>();
  const perCountryMap = new Map<string, PerBucketTotal>();
  const perStatusMap = new Map<string, PerBucketTotal>();
  const perLocaleMap = new Map<string, PerBucketTotal>();
  const perProviderMap = new Map<string, PerBucketTotal>();
  const perPaymentMap = new Map<string, PerBucketTotal>();
  const perReferralMap = new Map<string, PerBucketTotal>();
  const donorSet = new Set<string>();

  let totalAmountUSD = 0;
  let totalTeamSupportUSD = 0;
  let totalFeesUSD = 0;
  let totalChargedUSD = 0;
  let failedAmountUSD = 0;
  let oneTimeCount = 0;
  let monthlyCount = 0;

  // Status bucket (all rows, not just paid  admin still wants visibility on failed/etc.)
  for (const r of rows) {
    const sKey = r.status === "PAID" && !r.paidAt ? "PENDING" : r.status || "UNKNOWN";
    const sBucket = perStatusMap.get(sKey) ?? {
      key: sKey,
      label: exportPaymentStatus(sKey, r.paidAt),
      count: 0,
      donationAmount: 0,
      teamSupport: 0,
      amountUSD: 0,
    };
    sBucket.count += 1;
    sBucket.donationAmount += r.amount;
    sBucket.teamSupport += r.teamSupport;
    sBucket.amountUSD += r.amountUSD ?? 0;
    perStatusMap.set(sKey, sBucket);
  }

  for (const r of paid) {
    if (r.type === "MONTHLY") monthlyCount += 1;
    else oneTimeCount += 1;

    if (r.donor.id) donorSet.add(r.donor.id);

    const localCharged = r.totalAmount || r.amount + r.teamSupport + r.fees;
    const amountUsdShare = ratio(r.amount, localCharged, r.amountUSD);
    const teamUsdShare = ratio(r.teamSupport, localCharged, r.amountUSD);
    const feesUsdShare = ratio(r.fees, localCharged, r.amountUSD);
    totalAmountUSD += amountUsdShare;
    totalTeamSupportUSD += teamUsdShare;
    totalFeesUSD += feesUsdShare;
    totalChargedUSD += r.amountUSD ?? 0;

    // Per-currency local accounting
    const cur = r.currency || "USD";
    const curBucket = perCurrencyMap.get(cur) ?? {
      currency: cur,
      count: 0,
      donationAmount: 0,
      teamSupport: 0,
      fees: 0,
      totalCharged: 0,
      amountUSD: 0,
    };
    curBucket.count += 1;
    curBucket.donationAmount += r.amount;
    curBucket.teamSupport += r.teamSupport;
    curBucket.fees += r.fees;
    curBucket.totalCharged += r.totalAmount;
    curBucket.amountUSD += r.amountUSD ?? 0;
    perCurrencyMap.set(cur, curBucket);

    // Per-campaign: split amount evenly across multiple campaigns (rare),
    // otherwise it's a 1:1 mapping. teamSupport is allocated proportionally.
    const allTargets = [
      ...r.campaigns.map((c) => ({ kind: "campaign" as const, id: c.id, label: c.title })),
      ...r.categories.map((c) => ({ kind: "category" as const, id: c.id, label: c.name })),
    ];
    if (allTargets.length === 0) {
      // unattributed  bucket under "غير محدد"
      allTargets.push({ kind: "campaign", id: "_unassigned", label: dt("غير محدد") });
    }
    const portion = 1 / allTargets.length;
    for (const tgt of allTargets) {
      const map = tgt.kind === "campaign" ? perCampaignMap : perCategoryMap;
      const b = map.get(tgt.id) ?? {
        key: tgt.id,
        label: tgt.label,
        count: 0,
        donationAmount: 0,
        teamSupport: 0,
        amountUSD: 0,
      };
      b.count += portion;
      b.donationAmount += amountUsdShare * portion + 0; // USD basis for cross-currency
      b.teamSupport += teamUsdShare * portion;
      b.amountUSD += (r.amountUSD ?? 0) * portion;
      map.set(tgt.id, b);
    }

    // Per-country
    const countryKey = (r.donorCountryCode?.trim() || r.donor.countryCode?.trim() || "_unknown").toUpperCase();
    const countryBucket = perCountryMap.get(countryKey) ?? {
      key: countryKey,
      label: exportCountryName(countryKey),
      count: 0,
      donationAmount: 0,
      teamSupport: 0,
      amountUSD: 0,
    };
    countryBucket.count += 1;
    countryBucket.donationAmount += amountUsdShare;
    countryBucket.teamSupport += teamUsdShare;
    countryBucket.amountUSD += r.amountUSD ?? 0;
    perCountryMap.set(countryKey, countryBucket);

    // Per-locale
    const locKey = r.locale || "_unknown";
    const locBucket = perLocaleMap.get(locKey) ?? {
      key: locKey,
      label: exportLanguageName(r.locale),
      count: 0,
      donationAmount: 0,
      teamSupport: 0,
      amountUSD: 0,
    };
    locBucket.count += 1;
    locBucket.donationAmount += amountUsdShare;
    locBucket.teamSupport += teamUsdShare;
    locBucket.amountUSD += r.amountUSD ?? 0;
    perLocaleMap.set(locKey, locBucket);

    // Per-provider
    const provKey = r.provider || "_unknown";
    const provBucket = perProviderMap.get(provKey) ?? {
      key: provKey,
      label: provKey === "_unknown" ? dt("غير محدد") : provKey,
      count: 0,
      donationAmount: 0,
      teamSupport: 0,
      amountUSD: 0,
    };
    provBucket.count += 1;
    provBucket.donationAmount += amountUsdShare;
    provBucket.teamSupport += teamUsdShare;
    provBucket.amountUSD += r.amountUSD ?? 0;
    perProviderMap.set(provKey, provBucket);

    // Per-payment-method
    const pmKey = r.paymentMethod || "_unknown";
    const pmBucket = perPaymentMap.get(pmKey) ?? {
      key: pmKey,
      label: exportPaymentMethod(r.paymentMethod),
      count: 0,
      donationAmount: 0,
      teamSupport: 0,
      amountUSD: 0,
    };
    pmBucket.count += 1;
    pmBucket.donationAmount += amountUsdShare;
    pmBucket.teamSupport += teamUsdShare;
    pmBucket.amountUSD += r.amountUSD ?? 0;
    perPaymentMap.set(pmKey, pmBucket);

    // Per-referral
    const refKey = r.referral?.code ?? r.referral?.id ?? "_direct";
    const refLabel = r.referral?.name || r.referral?.code || (refKey === "_direct" ? dt("بدون إحالة") : refKey);
    const refBucket = perReferralMap.get(refKey) ?? {
      key: refKey,
      label: refLabel,
      count: 0,
      donationAmount: 0,
      teamSupport: 0,
      amountUSD: 0,
    };
    refBucket.count += 1;
    refBucket.donationAmount += amountUsdShare;
    refBucket.teamSupport += teamUsdShare;
    refBucket.amountUSD += r.amountUSD ?? 0;
    perReferralMap.set(refKey, refBucket);
  }

  for (const r of rows.filter((x) => x.status === "FAILED")) {
    failedAmountUSD += r.amountUSD ?? 0;
  }

  const sortByUsdDesc = (a: PerBucketTotal, b: PerBucketTotal) => b.amountUSD - a.amountUSD;

  return {
    totalCount: rows.length,
    paidCount: paid.length,
    failedCount: rows.filter((r) => r.status === "FAILED").length,
    oneTimeCount,
    monthlyCount,
    totalAmountUSD,
    totalTeamSupportUSD,
    totalFeesUSD,
    totalChargedUSD,
    failedAmountUSD,
    uniqueDonors: donorSet.size,
    perCurrency: Array.from(perCurrencyMap.values()).sort((a, b) => b.amountUSD - a.amountUSD),
    perCampaign: Array.from(perCampaignMap.values()).sort(sortByUsdDesc),
    perCategory: Array.from(perCategoryMap.values()).sort(sortByUsdDesc),
    perCountry: Array.from(perCountryMap.values()).sort(sortByUsdDesc),
    perStatus: Array.from(perStatusMap.values()).sort((a, b) => b.count - a.count),
    perLocale: Array.from(perLocaleMap.values()).sort(sortByUsdDesc),
    perProvider: Array.from(perProviderMap.values()).sort(sortByUsdDesc),
    perPaymentMethod: Array.from(perPaymentMap.values()).sort(sortByUsdDesc),
    perReferral: Array.from(perReferralMap.values()).sort(sortByUsdDesc),
  };
}

// ─── XLSX builder ─────────────────────────────────────────────────────────────

const HEADER_FILL = "FF243F4D";
const HEADER_TEXT = "FFFFFFFF";
const TOTAL_FILL = "FFF3E8D1";
const ALT_ROW_FILL = "FFF8FAFC";      // alternate row tint
const SECTION_FILL = "FF892E3C";
const SECTION_TEXT = "FFFFFFFF";

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { name: "Arial", bold: true, color: { argb: HEADER_TEXT }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF1E3A8A" } },
      bottom: { style: "thin", color: { argb: "FF1E3A8A" } },
      left: { style: "thin", color: { argb: "FF1E3A8A" } },
      right: { style: "thin", color: { argb: "FF1E3A8A" } },
    };
  });
  row.height = 34;
}

function styleSectionBanner(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { name: "Arial", bold: true, color: { argb: SECTION_TEXT }, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_FILL } };
    cell.alignment = { vertical: "middle", horizontal: dashDir() === "rtl" ? "right" : "left", indent: 1 };
  });
  row.height = 24;
}

function styleTotalRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { name: "Arial", bold: true, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
    cell.border = {
      top: { style: "medium", color: { argb: "FFD0AE69" } },
      bottom: { style: "thin", color: { argb: "FFD0AE69" } },
    };
  });
}

function applyZebra(sheet: ExcelJS.Worksheet, startRow: number, endRow: number) {
  for (let r = startRow; r <= endRow; r++) {
    if ((r - startRow) % 2 === 1) {
      const row = sheet.getRow(r);
      row.eachCell((cell) => {
        if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor == null) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW_FILL } };
        }
      });
    }
  }
}

function fmtMoney(n: number): number {
  // Excel stores raw numbers; the column's numFmt renders them. Round to 2 dp
  // here so Excel doesn't accumulate float fuzz like 1234.5600000003.
  return Math.round(n * 100) / 100;
}

const reportClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

/** XLSX dates have no zone: store Istanbul's wall clock, as the report states. */
function reportDate(value: Date): Date {
  const parts = reportClock.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second")));
}

function configureReportSheet(sheet: ExcelJS.Worksheet, columns: number, detail = false) {
  sheet.properties.defaultRowHeight = 23;
  sheet.properties.tabColor = { argb: SECTION_FILL };
  sheet.views = [{ rightToLeft: dashDir() === "rtl", state: "frozen", ySplit: detail ? 6 : 4, zoomScale: 90, showGridLines: false }];
  sheet.pageSetup = {
    paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: detail ? 2 : 1, fitToHeight: 0,
    printTitlesRow: detail ? "1:6" : "1:4",
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
  };
  sheet.headerFooter.oddFooter = "&LMinber Al-Aqsa&C&D&R&P / &N";
  for (let col = 1; col <= columns; col++) sheet.getColumn(col).width = col === 1 ? 36 : 20;
}

function addReportHeader(sheet: ExcelJS.Worksheet, input: DonationExportInput, columns: number) {
  const last = excelCol(columns);
  for (const r of [1, 2, 3, 4]) sheet.mergeCells(`A${r}:${last}${r}`);
  const title = sheet.getCell("A1");
  title.value = input.title;
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_FILL } };
  title.font = { name: "Arial", bold: true, size: 21, color: { argb: HEADER_TEXT } };
  title.alignment = { horizontal: dashDir() === "rtl" ? "right" : "left", vertical: "middle", indent: 1 };
  sheet.getRow(1).height = 43;
  sheet.getCell("A2").value = input.subtitle || dt("الفترة: كل الوقت");
  sheet.getCell("A2").font = { name: "Arial", size: 12, bold: true, color: { argb: "FF243F4D" } };
  sheet.getRow(2).height = 26;
  sheet.getCell("A3").value = dt("أُنشئ في: {0} — توقيت إسطنبول", [
    new Intl.DateTimeFormat(dashIntl("ar-EG"), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date()),
  ]);
  sheet.getCell("A3").font = { name: "Arial", size: 10, color: { argb: "FF64748B" } };
  sheet.getCell("A4").value = dt("الملخص المالي للدفعات المؤكدة فقط؛ لا تُجمع مبالغ العملات المختلفة.");
  sheet.getCell("A4").font = { name: "Arial", size: 10, color: { argb: "FF64748B" } };
  for (const r of [2, 3, 4]) sheet.getCell(`A${r}`).alignment = {
    horizontal: dashDir() === "rtl" ? "right" : "left", vertical: "middle", wrapText: true, indent: 1,
  };
  sheet.getRow(4).height = 30;
}

function readableFilters(filters: ExportFilterDescriptor[]): ExportFilterDescriptor[] {
  return filters.map(f => ({
    ...f,
    value: f.label === dt("الدولة") ? exportCountryName(f.value)
      : f.label === dt("اللغة") ? exportLanguageName(f.value)
      : f.label === dt("الحالة") || f.label === dt("حالة التبرع") ? exportPaymentStatus(f.value, f.value === "PAID" ? new Date(1) : null)
      : f.value,
  }));
}

function addCoverSheet(wb: ExcelJS.Workbook, input: DonationExportInput, agg: Aggregates) {
  const sheet = wb.addWorksheet(dt("ملخص التقرير"));
  configureReportSheet(sheet, 7);
  addReportHeader(sheet, input, 7);
  const moneyKpis = [
    [dt("إجمالي المبالغ المحصلة (USD)"), agg.totalChargedUSD],
    [dt("إجمالي التبرعات (USD)"), agg.totalAmountUSD],
    [dt("إجمالي دعم الفريق (USD)"), agg.totalTeamSupportUSD],
    [dt("إجمالي الرسوم (USD)"), agg.totalFeesUSD],
  ] as const;
  moneyKpis.forEach(([label, value], i) => {
    const row = 6 + Math.floor(i / 2) * 4;
    const first = i % 2 === 0 ? "A" : "E", last = i % 2 === 0 ? "C" : "G";
    sheet.mergeCells(`${first}${row}:${last}${row}`);
    sheet.mergeCells(`${first}${row + 1}:${last}${row + 2}`);
    const heading = sheet.getCell(`${first}${row}`), amount = sheet.getCell(`${first}${row + 1}`);
    heading.value = label;
    heading.font = { name: "Arial", size: 11, bold: true, color: { argb: "FF475569" } };
    heading.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    amount.value = fmtMoney(value);
    amount.numFmt = '"USD" #,##0.00';
    amount.font = { name: "Arial", size: 23, bold: true, color: { argb: i === 0 ? SECTION_FILL : HEADER_FILL } };
    amount.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i === 0 ? "FFF3E8D1" : "FFF1F5F9" } };
    amount.alignment = { horizontal: "center", vertical: "middle" };
  });
  const counts = [
    [dt("إجمالي عدد العمليات"), agg.totalCount],
    [dt("العمليات الناجحة"), agg.paidCount],
    [dt("العمليات الفاشلة"), agg.failedCount],
    [dt("قيد التأكيد"), input.donations.filter(r => r.status === "PENDING" || (r.status === "PAID" && !r.paidAt)).length],
    [dt("لمرة واحدة"), agg.oneTimeCount],
    [dt("متكرر"), agg.monthlyCount],
    [dt("متبرعين فريدين"), agg.uniqueDonors],
  ] as const;
  const filters = readableFilters(input.filters);
  sheet.mergeCells("A15:C15");
  sheet.mergeCells("E15:G15");
  sheet.getCell("A15").value = dt("المؤشرات الرئيسية");
  sheet.getCell("E15").value = dt("المعايير المطبقة");
  styleSectionBanner(sheet.getRow(15));
  sheet.mergeCells("A16:B16");
  sheet.mergeCells("F16:G16");
  sheet.getCell("A16").value = dt("المؤشر");
  sheet.getCell("C16").value = dt("القيمة");
  sheet.getCell("E16").value = dt("المعيار");
  sheet.getCell("F16").value = dt("القيمة");
  styleHeaderRow(sheet.getRow(16));
  const panelLength = Math.max(counts.length, filters.length);
  for (let i = 0; i < panelLength; i++) {
    const row = i + 17;
    if (counts[i]) {
      sheet.mergeCells(`A${row}:B${row}`);
      sheet.getCell(`A${row}`).value = counts[i][0];
      sheet.getCell(`C${row}`).value = counts[i][1];
    }
    if (filters[i]) {
      sheet.mergeCells(`F${row}:G${row}`);
      sheet.getCell(`E${row}`).value = filters[i].label;
      sheet.getCell(`F${row}`).value = filters[i].value;
    }
    sheet.getRow(row).eachCell(cell => {
      cell.font = { name: "Arial", size: 11, color: { argb: HEADER_FILL } };
      cell.alignment = { horizontal: dashDir() === "rtl" ? "right" : "left", vertical: "middle", wrapText: true };
      if (i % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW_FILL } };
    });
    sheet.getRow(row).height = 25;
  }
  addBreakdownTable(sheet, panelLength + 19, dt("تفصيل حسب العملة"),
    [dt("العملة"), dt("العدد"), dt("مبلغ التبرع (محلي)"), dt("دعم الفريق (محلي)"), dt("الرسوم (محلي)"), dt("إجمالي محصل (محلي)"), dt("بالدولار (USD)")],
    agg.perCurrency.map(c => [c.currency, c.count, fmtMoney(c.donationAmount), fmtMoney(c.teamSupport), fmtMoney(c.fees), fmtMoney(c.totalCharged), fmtMoney(c.amountUSD)]),
    { noTotal: true });
  sheet.pageSetup.printArea = `A1:G${sheet.rowCount}`;
  sheet.pageSetup.fitToHeight = 1;
}

function addBreakdownTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  headers: string[],
  rows: (string | number)[][],
  opts?: { highlightTop?: boolean; noTotal?: boolean }
): number {
  let r = startRow;
  if (rows.length === 0) return r;
  const lastCol = String.fromCharCode("A".charCodeAt(0) + headers.length - 1);
  sheet.mergeCells(`A${r}:${lastCol}${r}`);
  sheet.getCell(`A${r}`).value = title;
  styleSectionBanner(sheet.getRow(r));
  r += 1;

  const headerRow = sheet.getRow(r);
  headers.forEach((h, idx) => {
    headerRow.getCell(idx + 1).value = h;
  });
  styleHeaderRow(headerRow);
  r += 1;

  const dataStart = r;
  for (let i = 0; i < rows.length; i++) {
    const dataRow = sheet.getRow(r);
    rows[i].forEach((v, idx) => {
      const cell = dataRow.getCell(idx + 1);
      cell.value = v;
      cell.font = { name: "Arial", size: 11, color: { argb: "FF243F4D" } };
      if (typeof v === "number") {
        // First column is text label; numeric columns get currency format starting from col 3.
        cell.numFmt = idx >= 2 ? "#,##0.00" : "#,##0";
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.alignment = { horizontal: dashDir() === "rtl" ? "right" : "left", vertical: "middle", wrapText: true, indent: 1 };
      }
    });
    dataRow.height = Math.min(70, Math.max(25, ...rows[i].map(v => typeof v === "string" ? Math.ceil(v.length / 35) * 17 : 25)));
    if (opts?.highlightTop && i === 0) {
      dataRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FF166534" } };
      });
    }
    r += 1;
  }
  applyZebra(sheet, dataStart, r - 1);

  // Totals
  if (!opts?.noTotal && rows.length > 1) {
    const totalsRow = sheet.getRow(r);
    totalsRow.getCell(1).value = dt("الإجمالي");
    for (let col = 2; col <= headers.length; col++) {
      // Sum numeric columns only
      const sample = rows[0][col - 1];
      if (typeof sample === "number") {
        const colLetter = String.fromCharCode("A".charCodeAt(0) + col - 1);
        totalsRow.getCell(col).value = {
          formula: `SUM(${colLetter}${dataStart}:${colLetter}${r - 1})`,
          result: fmtMoney(rows.reduce((sum, values) => sum + Number(values[col - 1]), 0)),
        };
        totalsRow.getCell(col).numFmt = col >= 3 ? "#,##0.00" : "#,##0";
      }
    }
    styleTotalRow(totalsRow);
    r += 1;
  }
  return r + 1; // gap after the table
}

function addDonationsSheet(wb: ExcelJS.Workbook, input: DonationExportInput) {
  const rows = input.donations;
  const sheet = wb.addWorksheet(dt("التبرعات"));
  configureReportSheet(sheet, DONATION_COLUMNS.length, true);
  addReportHeader(sheet, input, DONATION_COLUMNS.length);

  const headerRow = sheet.getRow(6);
  DONATION_COLUMNS.forEach((col, idx) => {
    sheet.getColumn(idx + 1).width = col.width;
    headerRow.getCell(idx + 1).value = col.header;
  });
  styleHeaderRow(headerRow);

  for (let i = 0; i < rows.length; i++) {
    const dataRow = sheet.getRow(i + 7);
    DONATION_COLUMNS.forEach((col, idx) => {
      const cell = dataRow.getCell(idx + 1);
      const v = col.value(rows[i]);
      cell.value = v instanceof Date ? reportDate(v) : v == null ? "" : (v as ExcelJS.CellValue);
      cell.font = { name: "Arial", size: 11, color: { argb: "FF243F4D" } };
      if (col.numFmt) cell.numFmt = col.numFmt;
      cell.alignment = { horizontal: col.align ?? (dashDir() === "rtl" ? "right" : "left"), vertical: "middle", wrapText: true };

      // Highlight failed rows
      if (col.key === "status") {
        cell.font = { name: "Arial", bold: true, color: { argb: rows[i].status === "FAILED" ? "FFB91C1C" : rows[i].status === "PAID" && rows[i].paidAt ? "FF166534" : "FF92400E" } };
      }
    });
    dataRow.height = Math.min(160, Math.max(36, ...DONATION_COLUMNS.map(col => Math.ceil(String(col.value(rows[i]) ?? "").length / Math.max(10, col.width - 2)) * 16)));
  }

  if (rows.length > 0) {
    applyZebra(sheet, 7, rows.length + 6);

    // Totals row
    const confirmed = rows.filter(r => r.status === "PAID" && r.paidAt != null);
    const paidCurrencies = new Set(confirmed.map(r => r.currency));
    const totalsRow = sheet.getRow(rows.length + 7);
    totalsRow.getCell(1).value = dt("إجمالي المحصل المؤكد");
    totalsRow.getCell(11).value = paidCurrencies.size === 1 ? [...paidCurrencies][0] : "";
    DONATION_COLUMNS.forEach((col, idx) => {
      const colLetter = excelCol(idx + 1);
      if (col.key === "amount" || col.key === "teamSupport" || col.key === "fees" || col.key === "totalAmount" || col.key === "amountUSD") {
        const key = col.key as "amount" | "teamSupport" | "fees" | "totalAmount" | "amountUSD";
        totalsRow.getCell(idx + 1).value = key !== "amountUSD" && paidCurrencies.size > 1 ? "—" : {
          formula: `SUMIFS(${colLetter}7:${colLetter}${rows.length + 6},B7:B${rows.length + 6},"${dt("ناجح")}",E7:E${rows.length + 6},">0")`,
          result: fmtMoney(confirmed.reduce((sum, r) => sum + (r[key] ?? 0), 0)),
        };
        totalsRow.getCell(idx + 1).numFmt = "#,##0.00";
      }
    });
    styleTotalRow(totalsRow);

    sheet.autoFilter = {
      from: { row: 6, column: 1 },
      to: { row: rows.length + 6, column: DONATION_COLUMNS.length },
    };
  }
  sheet.pageSetup.printArea = `A1:${excelCol(DONATION_COLUMNS.length)}${sheet.rowCount}`;
}

function addSubscriptionsSheet(wb: ExcelJS.Workbook, input: DonationExportInput) {
  const rows = enrichedSubscriptions(input);
  const sheet = wb.addWorksheet(dt("الاشتراكات"));
  configureReportSheet(sheet, SUBSCRIPTION_COLUMNS.length, true);
  addReportHeader(sheet, input, SUBSCRIPTION_COLUMNS.length);

  const headerRow = sheet.getRow(6);
  SUBSCRIPTION_COLUMNS.forEach((col, idx) => {
    sheet.getColumn(idx + 1).width = col.width;
    headerRow.getCell(idx + 1).value = col.header;
  });
  styleHeaderRow(headerRow);

  for (let i = 0; i < rows.length; i++) {
    const dataRow = sheet.getRow(i + 7);
    SUBSCRIPTION_COLUMNS.forEach((col, idx) => {
      const cell = dataRow.getCell(idx + 1);
      const v = col.value(rows[i]);
      cell.value = v instanceof Date ? reportDate(v) : v == null ? "" : (v as ExcelJS.CellValue);
      cell.font = { name: "Arial", size: 11 };
      if (col.numFmt) cell.numFmt = col.numFmt;
      cell.alignment = { horizontal: col.align ?? (dashDir() === "rtl" ? "right" : "left"), vertical: "middle", wrapText: true };
      if (rows[i].status === "CANCELLED") {
        cell.font = { color: { argb: "FF9CA3AF" }, italic: true };
      } else if (rows[i].status === "PAUSED") {
        cell.font = { color: { argb: "FFB45309" } };
      }
    });
    dataRow.height = Math.min(160, Math.max(36, ...SUBSCRIPTION_COLUMNS.map(col => Math.ceil(String(col.value(rows[i]) ?? "").length / Math.max(10, col.width - 2)) * 16)));
  }

  if (rows.length > 0) {
    applyZebra(sheet, 7, rows.length + 6);

    const totalsRow = sheet.getRow(rows.length + 7);
    totalsRow.getCell(1).value = dt("الإجمالي");
    const currencies = new Set(rows.map(r => r.currency));
    SUBSCRIPTION_COLUMNS.forEach((col, idx) => {
      const colLetter = excelCol(idx + 1);
      if (
        col.key === "amount" ||
        col.key === "teamSupport" ||
        col.key === "amountUSD" ||
        col.key === "monthlyEquivalentUSD" ||
        col.key === "totalChargesCount" ||
        col.key === "totalChargesAmount" ||
        col.key === "totalChargesAmountUSD"
      ) {
        const key = col.key as "amount" | "teamSupport" | "amountUSD" | "monthlyEquivalentUSD" | "totalChargesCount" | "totalChargesAmount" | "totalChargesAmountUSD";
        totalsRow.getCell(idx + 1).value = (["amount", "teamSupport", "totalChargesAmount"].includes(key) && currencies.size > 1 || key === "totalChargesAmount" && rows.some(r => r.totalChargesAmount == null)) ? "—" : {
          formula: `SUM(${colLetter}7:${colLetter}${rows.length + 6})`,
          result: fmtMoney(rows.reduce((sum, r) => sum + (key === "monthlyEquivalentUSD" && (r.status !== "ACTIVE" || !r.totalChargesCount) ? 0 : r[key] ?? 0), 0)),
        };
        totalsRow.getCell(idx + 1).numFmt = col.key === "totalChargesCount" ? "#,##0" : "#,##0.00";
      }
    });
    styleTotalRow(totalsRow);

    sheet.autoFilter = {
      from: { row: 6, column: 1 },
      to: { row: rows.length + 6, column: SUBSCRIPTION_COLUMNS.length },
    };
  }
  sheet.pageSetup.printArea = `A1:${excelCol(SUBSCRIPTION_COLUMNS.length)}${sheet.rowCount}`;
}

function excelCol(n: number): string {
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

async function buildXlsx(input: DonationExportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Minber Al-Aqsa";
  wb.company = "Minber Al-Aqsa International";
  wb.calcProperties.fullCalcOnLoad = true;
  wb.created = new Date();
  wb.title = input.title;

  const agg = aggregate(input.donations);
  addCoverSheet(wb, input, agg);
  addManagementSheets(wb, input, agg);
  addDonationsSheet(wb, input);
  if (input.subscriptions) {
    addSubscriptionsSheet(wb, input);
  }

  addDetailedAnalysis(wb, input);
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return Buffer.from(buf);
}

/** Presentation views use the same settled-payment totals as the existing exporter. */
function addManagementSheets(wb: ExcelJS.Workbook, input: DonationExportInput, agg: Aggregates) {
  const paid = input.donations.filter(r => r.status === "PAID" && r.paidAt != null);
  const makeSheet = (name: string, columns: number) => {
    const sheet = wb.addWorksheet(dt(name));
    configureReportSheet(sheet, columns);
    addReportHeader(sheet, input, columns);
    return sheet;
  };
  const countryKey = (r: DonationExportRow) => r.donorCountryCode?.trim() || r.donor.countryCode || "_unknown";
  const groups = (rows: DonationExportRow[], key: (r: DonationExportRow) => string) => {
    const map = new Map<string, DonationExportRow[]>();
    for (const row of rows) {
      const value = key(row);
      const list = map.get(value) ?? [];
      list.push(row);
      map.set(value, list);
    }
    return [...map];
  };
  const baseUsd = (r: DonationExportRow) => ratio(r.amount, r.totalAmount || r.amount + r.teamSupport + r.fees, r.amountUSD);
  const metrics = (rows: DonationExportRow[], key: (r: DonationExportRow) => string, label: (key: string) => string) =>
    groups(rows, key).map(([key, items]) => ({ label: label(key), count: items.length, amount: items.reduce((sum, r) => sum + baseUsd(r), 0) }))
      .sort((a, b) => b.amount - a.amount);

  // Country and language tables intentionally have independent external spend inputs.
  // Counts are actual transactions. No monetary allocation is presented as a count.
  const performance = (sheet: ExcelJS.Worksheet, start: number, title: string, label: string,
    rows: { label: string; count: number; amount: number }[]) => {
    sheet.mergeCells(`A${start}:H${start}`);
    sheet.getCell(`A${start}`).value = title;
    styleSectionBanner(sheet.getRow(start));
    const headers = [label, dt("عدد التبرعات"), dt("مبلغ التبرع (USD)"), dt("متوسط التبرع (USD)"), dt("النسبة من التبرعات"), dt("الصرف الإعلاني (USD)"), dt("تكلفة التبرع (USD)"), dt("نسبة الصرف")];
    headers.forEach((value, i) => { sheet.getCell(start + 1, i + 1).value = value; });
    styleHeaderRow(sheet.getRow(start + 1));
    sheet.getRow(start + 1).height = 44;
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    rows.forEach((item, i) => {
      const r = start + 2 + i;
      const row = sheet.getRow(r);
      row.values = [item.label, item.count, fmtMoney(item.amount), { formula: `IFERROR(C${r}/B${r},0)`, result: item.count ? fmtMoney(item.amount) / item.count : 0 }, total ? item.amount / total : 0];
      row.getCell(6).value = null;
      row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
      row.getCell(6).dataValidation = { type: "decimal", operator: "greaterThanOrEqual", formulae: [0], allowBlank: true, showErrorMessage: true, errorTitle: dt("الصرف الإعلاني"), error: dt("أدخل مبلغًا لا يقل عن صفر") };
      row.getCell(7).value = { formula: `IF(ISNUMBER(F${r}),IFERROR(F${r}/B${r},""),"")`, result: "" };
      row.getCell(8).value = { formula: `IF(ISNUMBER(F${r}),IFERROR(F${r}/C${r},""),"")`, result: "" };
      row.height = Math.max(30, Math.ceil(item.label.length / 32) * 18);
      for (let c = 1; c <= 8; c++) {
        const cell = row.getCell(c);
        cell.font = { name: "Arial", size: 11, color: { argb: HEADER_FILL } };
        cell.alignment = { horizontal: c === 1 ? (dashDir() === "rtl" ? "right" : "left") : "right", vertical: "middle", wrapText: true };
        cell.numFmt = c === 2 ? "#,##0" : c === 5 || c === 8 ? "0.0%" : "#,##0.00";
      }
    });
    applyZebra(sheet, start + 2, start + 1 + rows.length);
    sheet.getColumn(1).width = 42;
    sheet.pageSetup.printArea = `A1:H${sheet.rowCount}`;
    return start + rows.length + 4;
  };

  const cover = wb.worksheets[0];
  let next = cover.rowCount + 3;
  next = addBreakdownTable(cover, next, dt("مصادر التبرعات"),
    [dt("المصدر"), dt("العدد"), dt("مبلغ التبرع (محلي)"), dt("العملة"), dt("بالدولار (USD)")],
    groups(paid, r => JSON.stringify([r.provider || "_unknown", r.type, r.currency])).map(([, rows]) => {
      const first = rows[0];
      return [`${first.provider || dt("غير محدد")} — ${first.type === "MONTHLY" ? dt("متكرر") : dt("لمرة واحدة")}`, rows.length, fmtMoney(rows.reduce((sum, r) => sum + r.amount, 0)), first.currency, fmtMoney(rows.reduce((sum, r) => sum + baseUsd(r), 0))];
    }), { noTotal: true });
  next = addBreakdownTable(cover, next, dt("متوسط التبرع"), [dt("المؤشر"), dt("القيمة")],
    [[dt("متوسط التبرع (USD)"), agg.paidCount ? fmtMoney(agg.totalAmountUSD / agg.paidCount) : 0]], { noTotal: true });
  cover.getCell(next - 2, 2).numFmt = "#,##0.00";
  performance(cover, next, dt("الصرف الإعلاني الإجمالي"), dt("النطاق"), [{ label: dt("جميع التبرعات"), count: agg.paidCount, amount: agg.totalAmountUSD }]);
  cover.getCell("A4").value = dt("الملخص للدفعات المؤكدة. الخانات الصفراء للصرف الخارجي بالدولار. لا تُجمع العملات الأصلية المختلفة.");
  cover.pageSetup.printArea = `A1:H${cover.rowCount}`;
  cover.pageSetup.fitToHeight = 0;

  const countries = makeSheet("الدول", 8);
  performance(countries, 6, dt("التبرعات حسب الدولة"), dt("الدولة"), metrics(paid, countryKey, exportCountryName));
  const languages = makeSheet("اللغات", 8);
  let languageRow = performance(languages, 6, dt("التبرعات حسب اللغة"), dt("اللغة"), metrics(paid, r => r.locale || "_unknown", exportLanguageName));
  for (const [locale, rows] of groups(paid, r => r.locale || "_unknown")) {
    languageRow = performance(languages, languageRow, exportLanguageName(locale), dt("الدولة"), metrics(rows, countryKey, exportCountryName));
  }
  for (const sheet of [countries, languages]) {
    sheet.mergeCells(`A${sheet.rowCount + 2}:H${sheet.rowCount + 2}`);
    const note = sheet.getCell(sheet.rowCount, 1);
    note.value = dt("الخانات الصفراء لإضافة الصرف من الخارج. كل جدول مستقل؛ أدخل الصرف المطابق له. الحسابات فارغة حتى إضافة الصرف.");
    note.alignment = { wrapText: true, vertical: "middle" };
    sheet.getRow(sheet.rowCount).height = 35;
    sheet.pageSetup.printArea = `A1:H${sheet.rowCount}`;
  }

  const projects = makeSheet("المشاريع", 4);
  const projectTable = (start: number, title: string, rows: DonationExportRow[]) => {
    const byProject = new Map<string, { label: string; donations: Set<string>; amount: number }>();
    for (const row of rows) {
      const lines = row.projectAllocations ?? (row.campaigns.length === 1 && !row.categories.length
        ? [{ ...row.campaigns[0], amount: row.amount }] : []);
      const valid = lines.filter(line => Number.isFinite(line.amount) && line.amount > 0);
      const allocated = valid.reduce((sum, line) => sum + line.amount, 0);
      // Never assign an untraceable legacy basket equally or duplicate its total.
      const entries = allocated > row.amount + 0.000001 ? [] : valid;
      const remainder = entries.length ? Math.max(0, row.amount - allocated) : row.amount;
      if (remainder > 0 || !entries.length) entries.push({ id: "_unknown", title: dt("غير محدد"), amount: remainder });
      for (const line of entries) {
        const bucket = byProject.get(line.id) ?? { label: line.title, donations: new Set<string>(), amount: 0 };
        bucket.donations.add(row.id);
        bucket.amount += ratio(line.amount, row.totalAmount || row.amount + row.teamSupport + row.fees, row.amountUSD);
        byProject.set(line.id, bucket);
      }
    }
    const buckets = [...byProject.values()].map(b => ({ label: b.label, count: b.donations.size, amount: b.amount }))
      .sort((a, b) => b.amount - a.amount);
    const total = buckets.reduce((sum, b) => sum + b.amount, 0);
    const end = addBreakdownTable(projects, start, title,
      [dt("المشروع"), dt("عدد التبرعات"), dt("مبلغ التبرع (USD)"), dt("النسبة من التبرعات")],
      buckets.map(b => [b.label, b.count, fmtMoney(b.amount), total ? b.amount / total : 0]));
    for (let r = start + 2; r < end - 1; r++) projects.getCell(r, 4).numFmt = "0.0%";
    return end;
  };
  let projectRow = projectTable(6, dt("جميع اللغات"), paid);
  for (const [locale, rows] of groups(paid, r => r.locale || "_unknown")) projectRow = projectTable(projectRow, exportLanguageName(locale), rows);
  projects.getColumn(1).width = 78;
  projects.pageSetup.printArea = `A1:D${projects.rowCount}`;

  const failed = makeSheet("المحاولات الفاشلة", 3);
  const failures = input.donations.filter(r => r.status === "FAILED");
  let failedRow = 6;
  for (const [title, key, label] of [
    [dt("حسب الدولة"), countryKey, exportCountryName],
    [dt("حسب بوابة الدفع"), (r: DonationExportRow) => r.provider || dt("غير محدد"), (s: string) => s],
  ] as const) {
    failedRow = addBreakdownTable(failed, failedRow, title, [dt("البيان"), dt("عدد المحاولات"), dt("مبلغ المحاولات (USD)")],
      groups(failures, key).map(([key, rows]) => [label(key), rows.length, fmtMoney(rows.reduce((sum, r) => sum + (r.amountUSD ?? 0), 0))]));
  }
  failed.getCell("A4").value = dt("المبالغ المعروضة تخص محاولات فاشلة ولم تُحتسب ضمن الإيرادات.");
  failed.pageSetup.printArea = `A1:C${failed.rowCount}`;
}

// ─── CSV builder ──────────────────────────────────────────────────────────────

function csvEscape(v: string | number | Date | null | undefined): string {
  if (v == null) return "";
  let s: string;
  if (v instanceof Date) s = reportDate(v).toISOString().replace("Z", "+03:00");
  else s = String(v);
  if (typeof v === "string" && /^\s*[=+@-]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(input: DonationExportInput): Buffer {
  const lines: string[] = [];
  lines.push(`# ${input.title}`);
  if (input.subtitle) lines.push(`# ${input.subtitle}`);
  lines.push(`# generated at: ${new Date().toISOString()}`);
  if (input.filters.length > 0) {
    lines.push(dt("# المعايير المطبقة:"));
    for (const f of readableFilters(input.filters)) lines.push(`# ${f.label}: ${f.value}`);
  }
  lines.push("");

  // Donations
  lines.push(DONATION_COLUMNS.map((c) => csvEscape(c.header)).join(","));
  for (const r of input.donations) {
    lines.push(DONATION_COLUMNS.map((c) => csvEscape(c.value(r))).join(","));
  }
  lines.push("");

  // Subscriptions (optional)
  if (input.subscriptions && input.subscriptions.length > 0) {
    lines.push(dt("# الاشتراكات ({0})", [input.subscriptions.length]));
    lines.push(SUBSCRIPTION_COLUMNS.map((c) => csvEscape(c.header)).join(","));
    for (const r of enrichedSubscriptions(input)) {
      lines.push(SUBSCRIPTION_COLUMNS.map((c) => csvEscape(c.value(r))).join(","));
    }
    lines.push("");
  }

  // Summary
  const agg = aggregate(input.donations);
  lines.push(dt("# ===== الملخص ====="));
  const kpis: [string, number | string][] = [
    [dt("إجمالي عدد العمليات"), agg.totalCount],
    [dt("العمليات الناجحة"), agg.paidCount],
    [dt("العمليات الفاشلة"), agg.failedCount],
    [dt("لمرة واحدة"), agg.oneTimeCount],
    [dt("متكرر"), agg.monthlyCount],
    [dt("متبرعين فريدين"), agg.uniqueDonors],
    [dt("إجمالي التبرعات (USD)"), fmtMoney(agg.totalAmountUSD)],
    [dt("إجمالي دعم الفريق (USD)"), fmtMoney(agg.totalTeamSupportUSD)],
    [dt("إجمالي الرسوم (USD)"), fmtMoney(agg.totalFeesUSD)],
    [dt("إجمالي المبالغ المحصلة (USD)"), fmtMoney(agg.totalChargedUSD)],
    [dt("قيمة العمليات الفاشلة (USD)"), fmtMoney(agg.failedAmountUSD)],
  ];
  for (const [k, v] of kpis) lines.push(`${csvEscape(k)},${csvEscape(v)}`);

  const appendBreakdown = (label: string, headers: string[], rows: (string | number)[][]) => {
    if (rows.length === 0) return;
    lines.push("");
    lines.push(`# ${label}`);
    lines.push(headers.map(csvEscape).join(","));
    for (const r of rows) lines.push(r.map(csvEscape).join(","));
  };

  appendBreakdown(
    dt("حسب العملة"),
    [dt("العملة"), dt("العدد"), dt("مبلغ التبرع (محلي)"), dt("دعم الفريق (محلي)"), dt("الرسوم (محلي)"), dt("إجمالي محصل (محلي)"), dt("بالدولار (USD)")],
    agg.perCurrency.map((c) => [
      c.currency,
      c.count,
      fmtMoney(c.donationAmount),
      fmtMoney(c.teamSupport),
      fmtMoney(c.fees),
      fmtMoney(c.totalCharged),
      fmtMoney(c.amountUSD),
    ])
  );
  appendBreakdown(
    dt("حسب الحملة (الأعلى أولًا)"),
    [dt("الحملة"), dt("العدد"), dt("مبلغ التبرع (USD)"), dt("دعم الفريق (USD)"), dt("إجمالي (USD)")],
    agg.perCampaign.map((b) => [b.label, Math.round(b.count * 100) / 100, fmtMoney(b.donationAmount), fmtMoney(b.teamSupport), fmtMoney(b.amountUSD)])
  );
  appendBreakdown(
    dt("حسب القسم (الأعلى أولًا)"),
    [dt("القسم"), dt("العدد"), dt("مبلغ التبرع (USD)"), dt("دعم الفريق (USD)"), dt("إجمالي (USD)")],
    agg.perCategory.map((b) => [b.label, Math.round(b.count * 100) / 100, fmtMoney(b.donationAmount), fmtMoney(b.teamSupport), fmtMoney(b.amountUSD)])
  );
  appendBreakdown(
    dt("حسب الدولة"),
    [dt("الدولة"), dt("العدد"), dt("مبلغ التبرع (USD)"), dt("دعم الفريق (USD)"), dt("إجمالي (USD)")],
    agg.perCountry.map((b) => [b.label, b.count, fmtMoney(b.donationAmount), fmtMoney(b.teamSupport), fmtMoney(b.amountUSD)])
  );
  appendBreakdown(
    dt("حسب الإحالة"),
    [dt("الإحالة"), dt("العدد"), dt("مبلغ التبرع (USD)"), dt("دعم الفريق (USD)"), dt("إجمالي (USD)")],
    agg.perReferral.map((b) => [b.label, b.count, fmtMoney(b.donationAmount), fmtMoney(b.teamSupport), fmtMoney(b.amountUSD)])
  );
  appendBreakdown(
    dt("حسب اللغة"),
    [dt("اللغة"), dt("العدد"), dt("مبلغ التبرع (USD)"), dt("دعم الفريق (USD)"), dt("إجمالي (USD)")],
    agg.perLocale.map((b) => [b.label, b.count, fmtMoney(b.donationAmount), fmtMoney(b.teamSupport), fmtMoney(b.amountUSD)])
  );
  appendBreakdown(
    dt("حسب بوابة الدفع"),
    [dt("البوابة"), dt("العدد"), dt("إجمالي (USD)")],
    agg.perProvider.map((b) => [b.label, b.count, fmtMoney(b.amountUSD)])
  );
  appendBreakdown(
    dt("حسب وسيلة الدفع"),
    [dt("الوسيلة"), dt("العدد"), dt("إجمالي (USD)")],
    agg.perPaymentMethod.map((b) => [b.label, b.count, fmtMoney(b.amountUSD)])
  );
  appendBreakdown(
    dt("حسب الحالة"),
    [dt("الحالة"), dt("العدد"), dt("إجمالي (USD)")],
    agg.perStatus.map((b) => [b.label, b.count, fmtMoney(b.amountUSD)])
  );

  return Buffer.from("﻿" + lines.join("\r\n"), "utf-8");
}

// ─── Public entry point ───────────────────────────────────────────────────────

/** Map common Arabic report titles to ASCII slugs so the file works on systems
 *  that strip non-latin characters from filenames (Windows Explorer is fine,
 *  but some download tools and email clients are not). The Content-Disposition
 *  header in the route uses RFC 5987 to expose the full Arabic name too. */
function asciiSlugFor(title: string): string {
  const map: Record<string, string> = {
    "تقرير التبرعات": "donations-report",
    "تقرير الاشتراكات الشهرية": "monthly-subscriptions-report",
    "تقرير التبرعات المتكررة": "recurring-donations-report",
    "تقرير الإحالة": "referral-report",
  };
  /* The title arrives in the interface language. */
  for (const [arabic, slug] of Object.entries(map)) if (title === arabic || title === dt(arabic)) return slug;
  // Last resort: keep only ASCII characters, collapse the rest.
  const ascii = title.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return ascii || "report";
}

export function buildDonationExport(input: DonationExportInput): Promise<ExportResult> {
  return withReportLanguage(input.language, () => buildLocalizedExport(input));
}

async function buildLocalizedExport(input: DonationExportInput): Promise<ExportResult> {
  input = { ...input, title: dt(input.title) };
  const datePart = new Date().toISOString().slice(0, 10);
  const ascii = asciiSlugFor(input.title);
  // Keep the Arabic title in the UTF-8 variant so browsers that honour
  // filename*=UTF-8'' show the user-friendly name. Strip filesystem-illegal
  // characters from both variants.
  const sanitizeFs = (s: string) => s.replace(/[\/\\:*?"<>|]+/g, "-").trim();
  const utf8Title = sanitizeFs(input.title);
  if (input.format === "csv") {
    return {
      body: buildCsv(input),
      contentType: "text/csv; charset=utf-8",
      filename: `${ascii}-${datePart}.csv`,
      filenameUtf8: `${utf8Title}-${datePart}.csv`,
    };
  }
  return {
    body: await buildXlsx(input),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `${ascii}-${datePart}.xlsx`,
    filenameUtf8: `${utf8Title}-${datePart}.xlsx`,
  };
}

/** Build a Content-Disposition header value that is safe for HTTP transport
 *  (ASCII filename) but also surfaces the original Arabic name in browsers
 *  that follow RFC 5987  Chrome, Firefox, Safari all do. */
export function buildContentDisposition(result: ExportResult): string {
  const safe = result.filename.replace(/[^\w.\-]/g, "_");
  // RFC 5987: encode any character that isn't an attr-char. encodeURIComponent
  // leaves !'()* alone; encode them explicitly to be header-safe.
  const utf8 = encodeURIComponent(result.filenameUtf8).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
  return `attachment; filename="${safe}"; filename*=UTF-8''${utf8}`;
}



/** Each local-money row has exactly one currency. Missing USD is visible, never an invented rate. */
function addDetailedAnalysis(wb: ExcelJS.Workbook, input: DonationExportInput) {
  const make = (name: string, headers: string[], values: ExcelJS.CellValue[][], note: string) => {
    const sheet = wb.addWorksheet(dt(name));
    configureReportSheet(sheet, headers.length, true);
    sheet.properties.tabColor = { argb: name === "بوابات الدفع" ? "FFB88B43" : "FF153847" };
    addReportHeader(sheet, input, headers.length);
    sheet.getCell("A4").value = dt(note);
    sheet.getRow(4).height = 48;
    headers.forEach((h, i) => { sheet.getCell(6, i + 1).value = dt(h); sheet.getColumn(i + 1).width = headers.length === 3 ? [40, 22, 80][i] : i < 4 ? 24 : 20; });
    styleHeaderRow(sheet.getRow(6)); sheet.getRow(6).height = 48;
    values.forEach((row, i) => row.forEach((v, j) => {
      const cell = sheet.getCell(i + 7, j + 1); cell.value = v;
      cell.alignment = { horizontal: typeof v === "number" ? "right" : dashDir() === "rtl" ? "right" : "left", vertical: "middle", wrapText: true };
      if (typeof v === "number") {
        const heading = headers.length === 3 && j === 1 ? String(row[0]) : headers[j];
        const money = ["قيمة الدورات النشطة", "متوقع شهريًا (USD)", "مبلغ التبرع", "دعم الفريق", "الرسوم", "المحصّل الفعلي", "المحصّل المعروف (USD)", "محصّل نتائج التقرير"].some(h => heading === h || heading === dt(h));
        cell.numFmt = money ? "#,##0.00" : heading === "نسبة النجاح" ? '0.00"%"' : Number.isInteger(v) ? "#,##0" : "#,##0.00";
      }
    }));
    if (values.length) { applyZebra(sheet, 7, values.length + 6); sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: values.length + 6, column: headers.length } }; }
    sheet.pageSetup.printArea = `A1:${excelCol(headers.length)}${Math.max(7, sheet.rowCount)}`;
  };
  const groups = <T,>(rows: T[], key: (r: T) => string) => {
    const map = new Map<string, T[]>();
    for (const row of rows) { const k = key(row); const list = map.get(k) ?? []; list.push(row); map.set(k, list); }
    return [...map.values()];
  };
  const knownUsd = (rows: DonationExportRow[]) => fmtMoney(rows.reduce((sum, r) => sum + (r.amountUSD ?? 0), 0));
  const paid = (rows: DonationExportRow[]) => rows.filter(r => r.status === "PAID" && r.paidAt != null);
  make("بوابات الدفع", ["بوابة الدفع", "الدولة", "الدورية", "العملة", "عدد المحاولات", "عدد الدفعات الناجحة", "المحاولات الفاشلة", "قيد الانتظار", "نسبة النجاح", "مبلغ التبرع", "دعم الفريق", "الرسوم", "المحصّل الفعلي", "المحصّل المعروف (USD)", "دفعات بلا قيمة USD"],
    groups(input.donations, r => JSON.stringify([r.provider, r.donorCountryCode || r.donor.countryCode, r.subscriptionId ? r.frequency ?? null : "ONE_TIME", r.currency])).map(rows => {
      const r = rows[0], successful = paid(rows);
      return [r.provider || dt("غير محدد"), exportCountryName(r.donorCountryCode || r.donor.countryCode), r.subscriptionId ? r.frequency ? FREQUENCY_LABEL_AR[r.frequency] : dt("دورية غير محددة") : dt("مرة واحدة"), r.currency,
        rows.length, successful.length, rows.filter(r => r.status === "FAILED").length, rows.filter(r => r.status === "PENDING").length,
        fmtMoney(successful.length / rows.length * 100), ...["amount", "teamSupport", "fees", "totalAmount"].map(k => fmtMoney(successful.reduce((sum, r) => sum + r[k as "amount"], 0))), knownUsd(successful), successful.filter(r => r.amountUSD == null).length];
    }), "التحليل خاص بالصفوف المصدّرة؛ نسبة النجاح من كل المحاولات، والمبالغ للدفعات المؤكدة فقط. النسبة بوحدة %. USD يجمع القيم المتاحة فقط.");
  if (!input.subscriptions) return;
  const plans = input.subscriptions;
  const verified = plans.filter(s => s.status === "ACTIVE" && s.totalChargesCount > 0);
  const selectedPaid = paid(input.donations);
  make("ملخص الاشتراكات", ["المؤشر", "القيمة", "التوضيح"], [
    [dt("عدد الاشتراكات"), plans.length, dt("الاشتراكات المشمولة فقط")],
    [dt("المتبرعون المعروفون"), new Set(plans.map(s => s.donor.id).filter(Boolean)).size, dt("كل متبرع مرة واحدة مهما تعددت اشتراكاته")],
    [dt("اشتراكات بلا هوية متبرع"), plans.filter(s => !s.donor.id).length, dt("لا تدخل في عدد المتبرعين المعروفين")],
    [dt("نشط مؤكد"), verified.length, dt("نشط وله دفعة ناجحة سابقة")],
    [dt("بانتظار أول دفعة"), plans.filter(s => s.status === "ACTIVE" && !s.totalChargesCount).length, dt("لا يدخل في التوقع الشهري")],
    [dt("متوقف"), plans.filter(s => s.status === "PAUSED").length, ""],
    [dt("ملغي"), plans.filter(s => s.status === "CANCELLED").length, ""],
    [dt("تعذّر الخصم"), plans.filter(s => s.status === "PAYMENT_FAILED").length, ""],
    [dt("اشتراكات جديدة في الفترة"), plans.filter(s => (!input.period?.start || s.createdAt >= input.period.start) && (!input.period?.end || s.createdAt <= input.period.end)).length, dt("حسب تاريخ إنشاء الاشتراك ضمن النطاق المشمول")],
    ...(["DAILY", "FRIDAY", "MONTHLY"] as const).map(f => [FREQUENCY_LABEL_AR[f], verified.filter(s => (s.frequency ?? "MONTHLY") === f).length, dt("اشتراكات نشطة مؤكدة")] as ExcelJS.CellValue[]),
    [dt("متوقع شهريًا (USD)"), fmtMoney(verified.reduce((sum, s) => sum + (s.monthlyEquivalentUSD ?? 0), 0)), dt("توقع لأصل التبرع فقط؛ ليس إيرادًا محصّلًا")],
    [dt("نشط بلا قيمة USD"), verified.filter(s => s.monthlyEquivalentUSD == null).length, dt("مستبعد من توقع USD")],
    [dt("دفعات نتائج التقرير"), selectedPaid.filter(r => r.subscriptionId).length, dt("دفعات متكررة ناجحة ضمن الصفوف المصدّرة")],
    [dt("المحصّل المعروف (USD)"), knownUsd(selectedPaid.filter(r => r.subscriptionId)), dt("يشمل دعم الفريق والرسوم؛ القيم المتاحة فقط")],
    [dt("دفعات التقرير بلا USD"), selectedPaid.filter(r => r.subscriptionId && r.amountUSD == null).length, dt("لا يُفترض لها سعر صرف")],
  ], "الحالات لقطة حالية للاشتراكات المشمولة؛ الفترة والترشيحات وحد الصفوف تخص نتائج التبرعات. راجع نطاق الاشتراكات في صفحة الملخص.");
  const periodByPlan = new Map<string, DonationExportRow[]>();
  for (const r of paid(input.donations)) if (r.subscriptionId) { const rows = periodByPlan.get(r.subscriptionId) ?? []; rows.push(r); periodByPlan.set(r.subscriptionId, rows); }
  make("تحليل الاشتراكات", ["الدولة", "الدورية", "بوابة الدفع", "العملة", "عدد الاشتراكات", "المتبرعون المعروفون", "اشتراكات بلا هوية متبرع", "نشط مؤكد", "بانتظار أول دفعة", "متوقف", "ملغي", "تعذّر الخصم", "قيمة الدورات النشطة", "متوقع شهريًا (USD)", "نشط بلا قيمة USD", "دفعات نتائج التقرير", "محصّل نتائج التقرير", "المحصّل المعروف (USD)", "دفعات بلا قيمة USD"],
    groups(input.subscriptions, s => JSON.stringify([s.donor.countryCode, s.frequency ?? "MONTHLY", s.provider, s.currency])).map(rows => {
      const s = rows[0], active = rows.filter(s => s.status === "ACTIVE" && s.totalChargesCount > 0);
      const charges = rows.flatMap(s => periodByPlan.get(s.id) ?? []);
      return [exportCountryName(s.donor.countryCode), FREQUENCY_LABEL_AR[s.frequency ?? "MONTHLY"], s.provider || dt("غير محدد"), s.currency, rows.length,
        new Set(rows.map(s => s.donor.id).filter(Boolean)).size, rows.filter(s => !s.donor.id).length, active.length,
        rows.filter(s => s.status === "ACTIVE" && s.totalChargesCount === 0).length, rows.filter(s => s.status === "PAUSED").length,
        rows.filter(s => s.status === "CANCELLED").length, rows.filter(s => s.status === "PAYMENT_FAILED").length,
        fmtMoney(active.reduce((sum, s) => sum + s.amount, 0)), fmtMoney(active.reduce((sum, s) => sum + (s.monthlyEquivalentUSD ?? 0), 0)),
        active.filter(s => s.monthlyEquivalentUSD == null).length, charges.length,
        charges.some(r => r.currency !== s.currency) ? dt("عملات متعددة") : fmtMoney(charges.reduce((sum, r) => sum + r.totalAmount, 0)), knownUsd(charges), charges.filter(r => r.amountUSD == null).length];
    }), "الحالات لقطة حالية للاشتراكات المشمولة وليست تاريخية. النشط المؤكد له دفعة ناجحة سابقة. توقع USD للمبالغ المتاحة فقط: يومي ×30.44، الجمعة ×4.35، شهري ×1. ليس إيرادًا محصّلًا. المتبرع قد يظهر في أكثر من مجموعة.");
}

function enrichedSubscriptions(input: DonationExportInput): SubscriptionExportRow[] {
  const chargesByPlan = new Map<string, DonationExportRow[]>();
  for (const r of input.donations) if (r.subscriptionId && r.status === "PAID" && r.paidAt != null) {
    const charges = chargesByPlan.get(r.subscriptionId) ?? []; charges.push(r); chargesByPlan.set(r.subscriptionId, charges);
  }
  return (input.subscriptions ?? []).map(s => {
    const charges = chargesByPlan.get(s.id) ?? [];
    return { ...s, reportChargesCount: charges.length,
      reportChargesAmount: charges.some(r => r.currency !== s.currency) ? undefined : charges.reduce((sum, r) => sum + r.totalAmount, 0),
      reportChargesUSD: charges.reduce((sum, r) => sum + (r.amountUSD ?? 0), 0), reportChargesMissingUSD: charges.filter(r => r.amountUSD == null).length };
  });
}
