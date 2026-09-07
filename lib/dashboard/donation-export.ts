/**
 * Dashboard donation exporter.
 *
 * Produces either a structured XLSX workbook (multiple sheets, formatted
 * columns, frozen header, auto-filter) or a CSV with the same data plus a
 * summary block at the end.
 *
 * Financial separation:
 *   - "amount" column is the base donation only — what the donor pledged to
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

// ─── Public types ─────────────────────────────────────────────────────────────

export type ExportFormat = "xlsx" | "csv";

export interface DonationExportRow {
  id: string;
  status: string;
  type: "ONE_TIME" | "MONTHLY";
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
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
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
  totalChargesCount: number;
  /** Sum of amount across confirmed PAID charges (in subscription currency). */
  totalChargesAmount: number;
  /** Sum of amountUSD across confirmed PAID charges. */
  totalChargesAmountUSD: number;
}

export interface ExportFilterDescriptor {
  /** Human label, Arabic — appears on the "Filters Applied" section in the workbook. */
  label: string;
  value: string;
}

export interface DonationExportInput {
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
  /** ASCII-only filename — safe for the legacy `filename=` part of Content-Disposition. */
  filename: string;
  /** Human-friendly title (may contain Arabic) — emit as RFC 5987 `filename*=UTF-8''…`. */
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
   *  lives in a sibling column — Excel can't natively format mixed currencies
   *  in one column, and we need the raw number for downstream pivots). */
  numFmt?: string;
  /** Optional cell formatter returning the value placed in the cell. */
  value: (r: T) => string | number | Date | null;
}

const DONATION_COLUMNS: ColSpec<DonationExportRow>[] = [
  { key: "id", header: "رقم العملية", width: 26, value: (r) => r.id },
  { key: "status", header: "الحالة", width: 10, align: "center", value: (r) => r.status },
  { key: "type", header: "النوع", width: 12, align: "center", value: (r) => (r.type === "MONTHLY" ? "شهري" : "لمرة واحدة") },
  { key: "createdAt", header: "تاريخ الإنشاء", width: 19, numFmt: "yyyy-mm-dd hh:mm", value: (r) => r.createdAt },
  { key: "paidAt", header: "تاريخ الدفع", width: 19, numFmt: "yyyy-mm-dd hh:mm", value: (r) => r.paidAt },
  { key: "donorName", header: "اسم المتبرع", width: 24, value: (r) => r.donor.name ?? "" },
  { key: "donorEmail", header: "بريد المتبرع", width: 28, value: (r) => r.donor.email ?? "" },
  { key: "donorPhone", header: "هاتف المتبرع", width: 18, value: (r) => r.donor.phone ?? "" },
  { key: "country", header: "الدولة", width: 10, align: "center", value: (r) => (r.donorCountryCode ?? r.donor.countryCode ?? "").toString().toUpperCase() },
  { key: "locale", header: "اللغة", width: 8, align: "center", value: (r) => r.locale ?? "" },
  { key: "currency", header: "العملة", width: 10, align: "center", value: (r) => r.currency },
  { key: "amount", header: "مبلغ التبرع", width: 14, align: "right", numFmt: "#,##0.00", value: (r) => r.amount },
  { key: "teamSupport", header: "دعم الفريق", width: 14, align: "right", numFmt: "#,##0.00", value: (r) => r.teamSupport },
  { key: "fees", header: "رسوم المعالجة", width: 14, align: "right", numFmt: "#,##0.00", value: (r) => r.fees },
  { key: "totalAmount", header: "الإجمالي المدفوع", width: 16, align: "right", numFmt: "#,##0.00", value: (r) => r.totalAmount },
  { key: "amountUSD", header: "بالدولار (USD)", width: 14, align: "right", numFmt: "#,##0.00", value: (r) => r.amountUSD },
  { key: "coverFees", header: "غطى الرسوم", width: 12, align: "center", value: (r) => (r.coverFees ? "نعم" : "لا") },
  { key: "campaigns", header: "الحملات", width: 36, value: (r) => r.campaigns.map((c) => c.title).join("؛ ") },
  { key: "categories", header: "الأقسام", width: 28, value: (r) => r.categories.map((c) => c.name).join("؛ ") },
  { key: "referralCode", header: "رمز الإحالة", width: 14, align: "center", value: (r) => r.referral?.code ?? "" },
  { key: "referralName", header: "اسم الإحالة", width: 24, value: (r) => r.referral?.name ?? "" },
  { key: "paymentMethod", header: "وسيلة الدفع", width: 14, align: "center", value: (r) => r.paymentMethod ?? "" },
  { key: "provider", header: "بوابة الدفع", width: 14, align: "center", value: (r) => r.provider ?? "" },
  { key: "providerOrderId", header: "مرجع البوابة", width: 24, value: (r) => r.providerOrderId ?? "" },
  { key: "providerErrorMessage", header: "سبب الفشل", width: 30, value: (r) => r.providerErrorMessage ?? "" },
  { key: "subscriptionId", header: "رقم الاشتراك", width: 26, value: (r) => r.subscriptionId ?? "" },
  { key: "comment", header: "ملاحظة", width: 28, value: (r) => r.comment ?? "" },
];

const SUBSCRIPTION_COLUMNS: ColSpec<SubscriptionExportRow>[] = [
  { key: "id", header: "رقم الاشتراك", width: 26, value: (r) => r.id },
  { key: "status", header: "الحالة", width: 12, align: "center", value: (r) => r.status === "ACTIVE" ? "نشط" : r.status === "PAUSED" ? "متوقف" : "ملغي" },
  { key: "donorName", header: "اسم المتبرع", width: 24, value: (r) => r.donor.name ?? "" },
  { key: "donorEmail", header: "بريد المتبرع", width: 28, value: (r) => r.donor.email ?? "" },
  { key: "donorPhone", header: "هاتف المتبرع", width: 18, value: (r) => r.donor.phone ?? "" },
  { key: "country", header: "الدولة", width: 10, align: "center", value: (r) => (r.donor.countryCode ?? "").toString().toUpperCase() },
  { key: "currency", header: "العملة", width: 10, align: "center", value: (r) => r.currency },
  { key: "amount", header: "قيمة الدورة", width: 14, align: "right", numFmt: "#,##0.00", value: (r) => r.amount },
  { key: "teamSupport", header: "دعم الفريق", width: 14, align: "right", numFmt: "#,##0.00", value: (r) => r.teamSupport },
  { key: "amountUSD", header: "بالدولار (USD)", width: 14, align: "right", numFmt: "#,##0.00", value: (r) => r.amountUSD },
  { key: "totalChargesCount", header: "عدد الدفعات الناجحة", width: 18, align: "center", numFmt: "#,##0", value: (r) => r.totalChargesCount },
  { key: "totalChargesAmount", header: "إجمالي الدفعات (محلي)", width: 18, align: "right", numFmt: "#,##0.00", value: (r) => r.totalChargesAmount },
  { key: "totalChargesAmountUSD", header: "إجمالي الدفعات (USD)", width: 18, align: "right", numFmt: "#,##0.00", value: (r) => r.totalChargesAmountUSD },
  { key: "paymentMethod", header: "وسيلة الدفع", width: 14, align: "center", value: (r) => r.paymentMethod ?? "" },
  { key: "createdAt", header: "تاريخ الإنشاء", width: 19, numFmt: "yyyy-mm-dd hh:mm", value: (r) => r.createdAt },
  { key: "lastBillingDate", header: "آخر دفعة", width: 19, numFmt: "yyyy-mm-dd hh:mm", value: (r) => r.lastBillingDate },
  { key: "nextBillingDate", header: "الدفعة القادمة", width: 19, numFmt: "yyyy-mm-dd hh:mm", value: (r) => r.nextBillingDate },
  { key: "campaigns", header: "الحملات", width: 36, value: (r) => r.campaigns.map((c) => c.title).join("؛ ") },
  { key: "categories", header: "الأقسام", width: 28, value: (r) => r.categories.map((c) => c.name).join("؛ ") },
  { key: "referralCode", header: "رمز الإحالة", width: 14, align: "center", value: (r) => r.referral?.code ?? "" },
  { key: "referralName", header: "اسم الإحالة", width: 24, value: (r) => r.referral?.name ?? "" },
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
  // workbook reported more successful donations — and more money — than the dashboard it was
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

  // Status bucket (all rows, not just paid — admin still wants visibility on failed/etc.)
  for (const r of rows) {
    const sKey = r.status || "UNKNOWN";
    const sBucket = perStatusMap.get(sKey) ?? {
      key: sKey,
      label: sKey,
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
      // unattributed — bucket under "غير محدد"
      allTargets.push({ kind: "campaign", id: "_unassigned", label: "غير محدد" });
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
    const countryKey = (r.donorCountryCode || r.donor.countryCode || "_unknown").toUpperCase();
    const countryBucket = perCountryMap.get(countryKey) ?? {
      key: countryKey,
      label: countryKey === "_UNKNOWN" ? "غير محدد" : countryKey,
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
      label: locKey === "_unknown" ? "غير محدد" : locKey,
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
      label: provKey === "_unknown" ? "غير محدد" : provKey,
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
      label: pmKey === "_unknown" ? "غير محدد" : pmKey,
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
    const refLabel = r.referral?.name || r.referral?.code || (refKey === "_direct" ? "بدون إحالة" : refKey);
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

const HEADER_FILL = "FF1E40AF";       // dark blue
const HEADER_TEXT = "FFFFFFFF";
const TOTAL_FILL = "FFE0F2FE";        // pale blue for total rows
const ALT_ROW_FILL = "FFF8FAFC";      // alternate row tint
const SECTION_FILL = "FF0F172A";      // section banner (slate-900)
const SECTION_TEXT = "FFFFFFFF";

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF1E3A8A" } },
      bottom: { style: "thin", color: { argb: "FF1E3A8A" } },
      left: { style: "thin", color: { argb: "FF1E3A8A" } },
      right: { style: "thin", color: { argb: "FF1E3A8A" } },
    };
  });
  row.height = 22;
}

function styleSectionBanner(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: SECTION_TEXT }, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  });
  row.height = 24;
}

function styleTotalRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
    cell.border = {
      top: { style: "medium", color: { argb: "FF1E40AF" } },
      bottom: { style: "thin", color: { argb: "FF1E40AF" } },
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

function addCoverSheet(
  wb: ExcelJS.Workbook,
  input: DonationExportInput,
  agg: Aggregates
) {
  const sheet = wb.addWorksheet("ملخص التقرير", { views: [{ rightToLeft: true, state: "normal" }] });

  sheet.mergeCells("A1:E1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = input.title;
  titleCell.font = { bold: true, size: 18, color: { argb: "FF0F172A" } };
  titleCell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
  sheet.getRow(1).height = 32;

  if (input.subtitle) {
    sheet.mergeCells("A2:E2");
    const sub = sheet.getCell("A2");
    sub.value = input.subtitle;
    sub.font = { italic: true, size: 12, color: { argb: "FF475569" } };
    sub.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
  }

  sheet.mergeCells("A3:E3");
  const meta = sheet.getCell("A3");
  meta.value = `أُنشئ في: ${new Date().toLocaleString("ar-EG", { timeZone: "UTC" })} (UTC)`;
  meta.font = { size: 10, color: { argb: "FF64748B" } };
  meta.alignment = { horizontal: "right", indent: 1 };

  let row = 5;

  // Filters applied
  if (input.filters.length > 0) {
    sheet.mergeCells(`A${row}:E${row}`);
    const banner = sheet.getCell(`A${row}`);
    banner.value = "المعايير المطبقة";
    styleSectionBanner(sheet.getRow(row));
    row += 1;
    for (const f of input.filters) {
      sheet.getCell(`A${row}`).value = f.label;
      sheet.getCell(`B${row}`).value = f.value;
      sheet.getCell(`A${row}`).font = { bold: true };
      sheet.getCell(`A${row}`).alignment = { horizontal: "right", indent: 1 };
      sheet.getCell(`B${row}`).alignment = { horizontal: "right", indent: 1 };
      row += 1;
    }
    row += 1;
  }

  // KPI grid
  sheet.mergeCells(`A${row}:E${row}`);
  sheet.getCell(`A${row}`).value = "المؤشرات الرئيسية";
  styleSectionBanner(sheet.getRow(row));
  row += 1;

  const kpis: [string, number | string, string?][] = [
    ["إجمالي عدد العمليات", agg.totalCount],
    ["العمليات الناجحة", agg.paidCount],
    ["العمليات الفاشلة", agg.failedCount],
    ["لمرة واحدة", agg.oneTimeCount],
    ["شهري", agg.monthlyCount],
    ["متبرعين فريدين", agg.uniqueDonors],
    ["إجمالي التبرعات (USD)", fmtMoney(agg.totalAmountUSD), "$"],
    ["إجمالي دعم الفريق (USD)", fmtMoney(agg.totalTeamSupportUSD), "$"],
    ["إجمالي الرسوم (USD)", fmtMoney(agg.totalFeesUSD), "$"],
    ["إجمالي المبالغ المحصلة (USD)", fmtMoney(agg.totalChargedUSD), "$"],
    ["قيمة العمليات الفاشلة (USD)", fmtMoney(agg.failedAmountUSD), "$"],
  ];
  for (const [label, val, sym] of kpis) {
    sheet.getCell(`A${row}`).value = label;
    const valueCell = sheet.getCell(`B${row}`);
    valueCell.value = val;
    if (typeof val === "number") {
      valueCell.numFmt = sym ? `${sym} #,##0.00` : "#,##0";
    }
    sheet.getCell(`A${row}`).font = { bold: true };
    sheet.getCell(`A${row}`).alignment = { horizontal: "right", indent: 1 };
    valueCell.font = { bold: true, color: { argb: "FF1E40AF" } };
    valueCell.alignment = { horizontal: "left" };
    row += 1;
  }
  row += 1;

  // Per-currency breakdown
  row = addBreakdownTable(
    sheet,
    row,
    "تفصيل حسب العملة",
    ["العملة", "العدد", "مبلغ التبرع (محلي)", "دعم الفريق (محلي)", "الرسوم (محلي)", "إجمالي محصل (محلي)", "بالدولار (USD)"],
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

  row = addBreakdownTable(
    sheet,
    row,
    "تفصيل حسب الحملة (الأعلى أولًا)",
    ["الحملة", "العدد", "مبلغ التبرع (USD)", "دعم الفريق (USD)", "إجمالي (USD)"],
    agg.perCampaign.map((b) => [
      b.label,
      Math.round(b.count * 100) / 100,
      fmtMoney(b.donationAmount),
      fmtMoney(b.teamSupport),
      fmtMoney(b.amountUSD),
    ]),
    { highlightTop: true }
  );

  row = addBreakdownTable(
    sheet,
    row,
    "تفصيل حسب القسم (الأعلى أولًا)",
    ["القسم", "العدد", "مبلغ التبرع (USD)", "دعم الفريق (USD)", "إجمالي (USD)"],
    agg.perCategory.map((b) => [
      b.label,
      Math.round(b.count * 100) / 100,
      fmtMoney(b.donationAmount),
      fmtMoney(b.teamSupport),
      fmtMoney(b.amountUSD),
    ])
  );

  row = addBreakdownTable(
    sheet,
    row,
    "تفصيل حسب الدولة",
    ["الدولة", "العدد", "مبلغ التبرع (USD)", "دعم الفريق (USD)", "إجمالي (USD)"],
    agg.perCountry.map((b) => [
      b.label,
      b.count,
      fmtMoney(b.donationAmount),
      fmtMoney(b.teamSupport),
      fmtMoney(b.amountUSD),
    ])
  );

  row = addBreakdownTable(
    sheet,
    row,
    "تفصيل حسب الإحالة",
    ["الإحالة", "العدد", "مبلغ التبرع (USD)", "دعم الفريق (USD)", "إجمالي (USD)"],
    agg.perReferral.map((b) => [
      b.label,
      b.count,
      fmtMoney(b.donationAmount),
      fmtMoney(b.teamSupport),
      fmtMoney(b.amountUSD),
    ])
  );

  row = addBreakdownTable(
    sheet,
    row,
    "تفصيل حسب اللغة",
    ["اللغة", "العدد", "مبلغ التبرع (USD)", "دعم الفريق (USD)", "إجمالي (USD)"],
    agg.perLocale.map((b) => [
      b.label,
      b.count,
      fmtMoney(b.donationAmount),
      fmtMoney(b.teamSupport),
      fmtMoney(b.amountUSD),
    ])
  );

  row = addBreakdownTable(
    sheet,
    row,
    "تفصيل حسب بوابة الدفع",
    ["البوابة", "العدد", "إجمالي (USD)"],
    agg.perProvider.map((b) => [b.label, b.count, fmtMoney(b.amountUSD)])
  );

  row = addBreakdownTable(
    sheet,
    row,
    "تفصيل حسب وسيلة الدفع",
    ["الوسيلة", "العدد", "إجمالي (USD)"],
    agg.perPaymentMethod.map((b) => [b.label, b.count, fmtMoney(b.amountUSD)])
  );

  row = addBreakdownTable(
    sheet,
    row,
    "تفصيل حسب الحالة",
    ["الحالة", "العدد", "إجمالي (USD)"],
    agg.perStatus.map((b) => [b.label, b.count, fmtMoney(b.amountUSD)])
  );

  // Column widths
  sheet.getColumn(1).width = 36;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 22;
  sheet.getColumn(4).width = 22;
  sheet.getColumn(5).width = 22;
  sheet.getColumn(6).width = 22;
  sheet.getColumn(7).width = 22;
}

function addBreakdownTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  headers: string[],
  rows: (string | number)[][],
  opts?: { highlightTop?: boolean }
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
      if (typeof v === "number") {
        // First column is text label; numeric columns get currency format starting from col 3.
        cell.numFmt = idx >= 2 ? "#,##0.00" : "#,##0";
        cell.alignment = { horizontal: "left" };
      } else {
        cell.alignment = { horizontal: "right", indent: 1 };
      }
    });
    if (opts?.highlightTop && i === 0) {
      dataRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FF166534" } };
      });
    }
    r += 1;
  }
  applyZebra(sheet, dataStart, r - 1);

  // Totals
  if (rows.length > 1) {
    const totalsRow = sheet.getRow(r);
    totalsRow.getCell(1).value = "الإجمالي";
    for (let col = 2; col <= headers.length; col++) {
      // Sum numeric columns only
      const sample = rows[0][col - 1];
      if (typeof sample === "number") {
        const colLetter = String.fromCharCode("A".charCodeAt(0) + col - 1);
        totalsRow.getCell(col).value = { formula: `SUM(${colLetter}${dataStart}:${colLetter}${r - 1})` };
        totalsRow.getCell(col).numFmt = col >= 3 ? "#,##0.00" : "#,##0";
      }
    }
    styleTotalRow(totalsRow);
    r += 1;
  }
  return r + 1; // gap after the table
}

function addDonationsSheet(wb: ExcelJS.Workbook, rows: DonationExportRow[]) {
  const sheet = wb.addWorksheet("التبرعات", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });

  const headerRow = sheet.getRow(1);
  DONATION_COLUMNS.forEach((col, idx) => {
    sheet.getColumn(idx + 1).width = col.width;
    headerRow.getCell(idx + 1).value = col.header;
  });
  styleHeaderRow(headerRow);

  for (let i = 0; i < rows.length; i++) {
    const dataRow = sheet.getRow(i + 2);
    DONATION_COLUMNS.forEach((col, idx) => {
      const cell = dataRow.getCell(idx + 1);
      const v = col.value(rows[i]);
      cell.value = v == null ? "" : (v as ExcelJS.CellValue);
      if (col.numFmt) cell.numFmt = col.numFmt;
      if (col.align) cell.alignment = { horizontal: col.align, vertical: "middle" };

      // Highlight failed rows
      if (rows[i].status === "FAILED") {
        cell.font = { color: { argb: "FFB91C1C" } };
      }
    });
  }

  if (rows.length > 0) {
    applyZebra(sheet, 2, rows.length + 1);

    // Totals row
    const totalsRow = sheet.getRow(rows.length + 2);
    totalsRow.getCell(1).value = "الإجمالي";
    DONATION_COLUMNS.forEach((col, idx) => {
      const colLetter = excelCol(idx + 1);
      if (col.key === "amount" || col.key === "teamSupport" || col.key === "fees" || col.key === "totalAmount" || col.key === "amountUSD") {
        totalsRow.getCell(idx + 1).value = {
          formula: `SUM(${colLetter}2:${colLetter}${rows.length + 1})`,
        };
        totalsRow.getCell(idx + 1).numFmt = "#,##0.00";
      }
    });
    styleTotalRow(totalsRow);

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: DONATION_COLUMNS.length },
    };
  }
}

function addSubscriptionsSheet(wb: ExcelJS.Workbook, rows: SubscriptionExportRow[]) {
  const sheet = wb.addWorksheet("الاشتراكات", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });

  const headerRow = sheet.getRow(1);
  SUBSCRIPTION_COLUMNS.forEach((col, idx) => {
    sheet.getColumn(idx + 1).width = col.width;
    headerRow.getCell(idx + 1).value = col.header;
  });
  styleHeaderRow(headerRow);

  for (let i = 0; i < rows.length; i++) {
    const dataRow = sheet.getRow(i + 2);
    SUBSCRIPTION_COLUMNS.forEach((col, idx) => {
      const cell = dataRow.getCell(idx + 1);
      const v = col.value(rows[i]);
      cell.value = v == null ? "" : (v as ExcelJS.CellValue);
      if (col.numFmt) cell.numFmt = col.numFmt;
      if (col.align) cell.alignment = { horizontal: col.align, vertical: "middle" };
      if (rows[i].status === "CANCELLED") {
        cell.font = { color: { argb: "FF9CA3AF" }, italic: true };
      } else if (rows[i].status === "PAUSED") {
        cell.font = { color: { argb: "FFB45309" } };
      }
    });
  }

  if (rows.length > 0) {
    applyZebra(sheet, 2, rows.length + 1);

    const totalsRow = sheet.getRow(rows.length + 2);
    totalsRow.getCell(1).value = "الإجمالي";
    SUBSCRIPTION_COLUMNS.forEach((col, idx) => {
      const colLetter = excelCol(idx + 1);
      if (
        col.key === "amount" ||
        col.key === "teamSupport" ||
        col.key === "amountUSD" ||
        col.key === "totalChargesCount" ||
        col.key === "totalChargesAmount" ||
        col.key === "totalChargesAmountUSD"
      ) {
        totalsRow.getCell(idx + 1).value = {
          formula: `SUM(${colLetter}2:${colLetter}${rows.length + 1})`,
        };
        totalsRow.getCell(idx + 1).numFmt = col.key === "totalChargesCount" ? "#,##0" : "#,##0.00";
      }
    });
    styleTotalRow(totalsRow);

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: SUBSCRIPTION_COLUMNS.length },
    };
  }
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
  wb.creator = "Alafiya Dashboard";
  wb.created = new Date();
  wb.title = input.title;

  const agg = aggregate(input.donations);
  addCoverSheet(wb, input, agg);
  addDonationsSheet(wb, input.donations);
  if (input.subscriptions) {
    addSubscriptionsSheet(wb, input.subscriptions);
  }

  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return Buffer.from(buf);
}

// ─── CSV builder ──────────────────────────────────────────────────────────────

function csvEscape(v: string | number | Date | null | undefined): string {
  if (v == null) return "";
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(input: DonationExportInput): Buffer {
  const lines: string[] = [];
  lines.push(`# ${input.title}`);
  if (input.subtitle) lines.push(`# ${input.subtitle}`);
  lines.push(`# generated at: ${new Date().toISOString()}`);
  if (input.filters.length > 0) {
    lines.push("# المعايير المطبقة:");
    for (const f of input.filters) lines.push(`# ${f.label}: ${f.value}`);
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
    lines.push(`# الاشتراكات (${input.subscriptions.length})`);
    lines.push(SUBSCRIPTION_COLUMNS.map((c) => csvEscape(c.header)).join(","));
    for (const r of input.subscriptions) {
      lines.push(SUBSCRIPTION_COLUMNS.map((c) => csvEscape(c.value(r))).join(","));
    }
    lines.push("");
  }

  // Summary
  const agg = aggregate(input.donations);
  lines.push("# ===== الملخص =====");
  const kpis: [string, number | string][] = [
    ["إجمالي عدد العمليات", agg.totalCount],
    ["العمليات الناجحة", agg.paidCount],
    ["العمليات الفاشلة", agg.failedCount],
    ["لمرة واحدة", agg.oneTimeCount],
    ["شهري", agg.monthlyCount],
    ["متبرعين فريدين", agg.uniqueDonors],
    ["إجمالي التبرعات (USD)", fmtMoney(agg.totalAmountUSD)],
    ["إجمالي دعم الفريق (USD)", fmtMoney(agg.totalTeamSupportUSD)],
    ["إجمالي الرسوم (USD)", fmtMoney(agg.totalFeesUSD)],
    ["إجمالي المبالغ المحصلة (USD)", fmtMoney(agg.totalChargedUSD)],
    ["قيمة العمليات الفاشلة (USD)", fmtMoney(agg.failedAmountUSD)],
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
    "حسب العملة",
    ["العملة", "العدد", "مبلغ التبرع (محلي)", "دعم الفريق (محلي)", "الرسوم (محلي)", "إجمالي محصل (محلي)", "بالدولار (USD)"],
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
    "حسب الحملة (الأعلى أولًا)",
    ["الحملة", "العدد", "مبلغ التبرع (USD)", "دعم الفريق (USD)", "إجمالي (USD)"],
    agg.perCampaign.map((b) => [b.label, Math.round(b.count * 100) / 100, fmtMoney(b.donationAmount), fmtMoney(b.teamSupport), fmtMoney(b.amountUSD)])
  );
  appendBreakdown(
    "حسب القسم (الأعلى أولًا)",
    ["القسم", "العدد", "مبلغ التبرع (USD)", "دعم الفريق (USD)", "إجمالي (USD)"],
    agg.perCategory.map((b) => [b.label, Math.round(b.count * 100) / 100, fmtMoney(b.donationAmount), fmtMoney(b.teamSupport), fmtMoney(b.amountUSD)])
  );
  appendBreakdown(
    "حسب الدولة",
    ["الدولة", "العدد", "مبلغ التبرع (USD)", "دعم الفريق (USD)", "إجمالي (USD)"],
    agg.perCountry.map((b) => [b.label, b.count, fmtMoney(b.donationAmount), fmtMoney(b.teamSupport), fmtMoney(b.amountUSD)])
  );
  appendBreakdown(
    "حسب الإحالة",
    ["الإحالة", "العدد", "مبلغ التبرع (USD)", "دعم الفريق (USD)", "إجمالي (USD)"],
    agg.perReferral.map((b) => [b.label, b.count, fmtMoney(b.donationAmount), fmtMoney(b.teamSupport), fmtMoney(b.amountUSD)])
  );
  appendBreakdown(
    "حسب اللغة",
    ["اللغة", "العدد", "مبلغ التبرع (USD)", "دعم الفريق (USD)", "إجمالي (USD)"],
    agg.perLocale.map((b) => [b.label, b.count, fmtMoney(b.donationAmount), fmtMoney(b.teamSupport), fmtMoney(b.amountUSD)])
  );
  appendBreakdown(
    "حسب بوابة الدفع",
    ["البوابة", "العدد", "إجمالي (USD)"],
    agg.perProvider.map((b) => [b.label, b.count, fmtMoney(b.amountUSD)])
  );
  appendBreakdown(
    "حسب وسيلة الدفع",
    ["الوسيلة", "العدد", "إجمالي (USD)"],
    agg.perPaymentMethod.map((b) => [b.label, b.count, fmtMoney(b.amountUSD)])
  );
  appendBreakdown(
    "حسب الحالة",
    ["الحالة", "العدد", "إجمالي (USD)"],
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
    "تقرير الإحالة": "referral-report",
  };
  if (map[title]) return map[title];
  // Last resort: keep only ASCII characters, collapse the rest.
  const ascii = title.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return ascii || "report";
}

export async function buildDonationExport(input: DonationExportInput): Promise<ExportResult> {
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
 *  that follow RFC 5987 — Chrome, Firefox, Safari all do. */
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
