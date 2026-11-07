import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { buildDonationExport, type DonationExportRow, type SubscriptionExportRow } from "../../lib/dashboard/donation-export";
import { exportCountryName } from "../../lib/dashboard/export-labels";
import { dt, setDashLocale } from "../../lib/dashboard/i18n";

const settled = new Date("2026-11-04T09:15:00Z");
function gift(patch: Partial<DonationExportRow> = {}): DonationExportRow {
  return {
    id: "synthetic-1", status: "PAID", type: "ONE_TIME", createdAt: settled, paidAt: settled,
    donor: { id: "synthetic-donor", name: "متبرع تجريبي", email: "sample@example.invalid", phone: "+900000000000", countryCode: "TR" },
    donorCountryCode: "SA", locale: "ar", currency: "USD", amount: 15.5, amountUSD: 35.5, teamSupport: 20,
    fees: 0, totalAmount: 35.5, coverFees: false, campaigns: [{ id: "synthetic-project", title: "مشروع تجريبي" }],
    categories: [], referral: null, paymentMethod: "CARD", provider: "ALBARAKA", providerOrderId: null,
    providerErrorMessage: null, subscriptionId: null, comment: null, attribution: null, ...patch,
  };
}

async function workbook(donations: DonationExportRow[], subscriptions?: SubscriptionExportRow[]) {
  const out = await buildDonationExport({ format: "xlsx", title: dt("تقرير التبرعات"), subtitle: "2026-11-04",
    filters: [{ label: dt("الدولة"), value: "SA" }], donations, subscriptions });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out.body as never);
  return wb;
}

for (const [locale, name, rtl] of [["ar", "المملكة العربية السعودية", true], ["en", "Saudi Arabia", false], ["tr", "Suudi Arabistan", false]] as const) {
  test(`export uses complete country names in ${locale} details, filters and analysis`, async () => {
    setDashLocale(locale);
    const wb = await workbook([gift()]);
    const rows = wb.getWorksheet(dt("التبرعات"))!;
    assert.equal(rows.getCell("I7").value, name);
    assert.equal(rows.views[0].rightToLeft, rtl);
    assert.equal("ySplit" in rows.views[0] ? rows.views[0].ySplit : 0, 6);
    assert.deepEqual(rows.autoFilter, "A6:AA7");
    assert.equal(rows.getCell("L7").value, 15.5);
    assert.equal(rows.getCell("L7").numFmt, "#,##0.00");
    for (const sheetName of [dt("ملخص التقرير"), dt("الدول")]) {
      const values: string[] = [];
      wb.getWorksheet(sheetName)!.eachRow(row => row.eachCell(cell => values.push(cell.text)));
      assert.ok(values.includes(name), sheetName);
      assert.ok(!values.includes("SA"), sheetName);
    }
    assert.equal(wb.creator, "Minber Al-Aqsa");
    setDashLocale("ar");
  });
}

test("unknown and blank countries have a readable label; country snapshot takes precedence", async () => {
  setDashLocale("ar");
  for (const code of [null, undefined, "", " ", "XX", "ZZ", "INVALID", "12"]) assert.equal(exportCountryName(code), dt("غير محدد"));
  const wb = await workbook([gift({ donorCountryCode: " " }), gift({ id: "synthetic-2", donorCountryCode: "XX" })]);
  const rows = wb.getWorksheet(dt("التبرعات"))!;
  assert.equal(rows.getCell("I7").value, "تركيا");
  assert.equal(rows.getCell("I8").value, dt("غير محدد"));
});

test("mixed-currency totals never add local amounts or failed and unconfirmed attempts", async () => {
  setDashLocale("ar");
  const wb = await workbook([
    gift(), gift({ id: "eur", currency: "EUR", amount: 100, teamSupport: 0, totalAmount: 100, amountUSD: 110 }),
    gift({ id: "failed", status: "FAILED", paidAt: null, amount: 500, amountUSD: 500, totalAmount: 500 }),
    gift({ id: "unsettled", paidAt: null, amount: 600, amountUSD: 600, totalAmount: 600 }),
  ]);
  const details = wb.getWorksheet(dt("التبرعات"))!;
  assert.equal(details.getCell("L11").value, "—");
  assert.equal(details.getCell("O11").value, "—");
  assert.equal((details.getCell("P11").value as ExcelJS.CellFormulaValue).result, 145.5);
  assert.match((details.getCell("P11").value as ExcelJS.CellFormulaValue).formula, /SUMIFS/);
  assert.equal(details.getCell("B10").value, dt("قيد التأكيد"));
  const summary = wb.getWorksheet(dt("ملخص التقرير"))!;
  assert.equal(summary.getCell("A7").value, 145.5);
});

test("single-currency totals reconcile base, support and fees and retain cached results", async () => {
  setDashLocale("ar");
  const wb = await workbook([gift(), gift({ id: "failed", status: "FAILED", paidAt: null })]);
  const rows = wb.getWorksheet(dt("التبرعات"))!;
  for (const [cell, value] of [["L9", 15.5], ["M9", 20], ["N9", 0], ["O9", 35.5], ["P9", 35.5]] as const)
    // ExcelJS reads the valid cached XML <v>0</v> as an absent result.
    assert.equal((rows.getCell(cell).value as ExcelJS.CellFormulaValue).result ?? 0, value);
  assert.equal(rows.getCell("K9").value, "USD");
});

test("export dates show Istanbul time consistently with the report", async () => {
  setDashLocale("ar");
  const wb = await workbook([gift()]);
  assert.equal((wb.getWorksheet(dt("التبرعات"))!.getCell("D7").value as Date).getUTCHours(), 12);
  const out = await buildDonationExport({ format: "csv", title: "تقرير التبرعات", filters: [], donations: [gift()] });
  assert.match(out.body.toString(), /2026-11-04T12:15:00.000\+03:00/);
});

test("CSV also uses full country and language names and keeps formula-looking input as text", async () => {
  setDashLocale("ar");
  const out = await buildDonationExport({ format: "csv", title: "تقرير التبرعات", filters: [{ label: "الدولة", value: "SA" }],
    donations: [gift({ comment: "=1+1" })] });
  const csv = out.body.toString();
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /المملكة العربية السعودية/);
  assert.match(csv, /العربية/);
  assert.match(csv, /'=1\+1/);
  assert.ok(!csv.includes(",SA,"));
});

test("empty reports remain valid workbooks with summary and filterable column headers", async () => {
  setDashLocale("ar");
  const wb = await workbook([]);
  assert.equal(wb.worksheets.length, 7);
  assert.equal(wb.getWorksheet(dt("التبرعات"))!.getCell("I6").value, dt("الدولة"));
  assert.equal(wb.getWorksheet(dt("ملخص التقرير"))!.getCell("A7").value, 0);
});

test("recurring report country labels are complete and its local totals respect currency", async () => {
  setDashLocale("ar");
  const plan: SubscriptionExportRow = {
    id: "synthetic-plan", status: "ACTIVE", frequency: "DAILY", monthlyEquivalentUSD: 30.44,
    donor: { id: "donor", name: "متبرع تجريبي", email: null, phone: null, countryCode: "TR" },
    amount: 1, amountUSD: 1, currency: "USD", teamSupport: 0, paymentMethod: "CARD", createdAt: settled,
    lastBillingDate: settled, nextBillingDate: null, campaigns: [], categories: [], referral: null,
    totalChargesCount: 2, totalChargesAmount: 2, totalChargesAmountUSD: 2,
  };
  const wb = await workbook([], [plan, { ...plan, id: "eur-plan", currency: "EUR" }]);
  const rows = wb.getWorksheet(dt("الاشتراكات"))!;
  assert.equal(rows.getCell("G7").value, "تركيا");
  assert.equal(rows.getCell("I9").value, "—");
  assert.equal((rows.getCell("L9").value as ExcelJS.CellFormulaValue).result, 60.88);
});


test("management views have integer cart counts, external spend inputs and blank guarded ratios", async () => {
  setDashLocale("ar");
  const wb = await workbook([gift({ campaigns: [{ id: "a", title: "أ" }, { id: "b", title: "ب" }] }), gift({ id: "failed", status: "FAILED", paidAt: null, amountUSD: 999 })]);
  assert.deepEqual(wb.worksheets.map(s => s.name), ["ملخص التقرير", "الدول", "اللغات", "المشاريع", "المحاولات الفاشلة", "التبرعات", "بوابات الدفع"]);
  const countries = wb.getWorksheet("الدول")!;
  assert.equal(countries.getCell("B8").value, 1);
  assert.equal(countries.getCell("C8").value, 15.5);
  assert.equal(countries.getCell("F8").value, null);
  assert.equal(countries.getCell("F8").dataValidation.type, "decimal");
  assert.equal(countries.getCell("G8").formula, 'IF(ISNUMBER(F8),IFERROR(F8/B8,""),"")');
  assert.equal(countries.getCell("H8").formula, 'IF(ISNUMBER(F8),IFERROR(F8/C8,""),"")');
  const projects = wb.getWorksheet("المشاريع")!;
  assert.equal(projects.getCell("B8").value, 1);
  assert.equal(projects.getCell("D8").numFmt, "0.0%");
  assert.equal(wb.getWorksheet("المحاولات الفاشلة")!.getCell("C8").value, 999);
});

function subscription(patch: Partial<SubscriptionExportRow> = {}): SubscriptionExportRow {
  return { id: "daily", status: "ACTIVE", frequency: "DAILY", provider: "PAYPAL", monthlyEquivalentUSD: 30.4375,
    donor: { id: "one-donor", name: "Synthetic donor", email: null, phone: null, countryCode: "US" },
    amount: 1, amountUSD: 1, currency: "USD", teamSupport: 0, paymentMethod: "PAYPAL", createdAt: settled,
    lastBillingDate: settled, nextBillingDate: settled, campaigns: [], categories: [], referral: null,
    totalChargesCount: 3, totalChargesAmount: 3, totalChargesAmountUSD: 3, ...patch };
}

function metric(sheet: ExcelJS.Worksheet, name: string): ExcelJS.CellValue {
  let result: ExcelJS.CellValue = null;
  sheet.eachRow(row => { if (row.getCell(1).value === name) result = row.getCell(2).value; });
  return result;
}

test("independent report languages remain isolated under concurrent exports", async () => {
  setDashLocale("tr");
  const outputs = await Promise.all((["ar", "en", "ar", "en"] as const).map(language => buildDonationExport({
    language, format: "xlsx", title: "تقرير التبرعات", filters: [], donations: [gift({ donor: { id: "x", name: "Synthetic donor", email: null, phone: null, countryCode: "US" }, campaigns: [] })], subscriptions: [subscription()],
  })));
  for (const [i, out] of outputs.entries()) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(out.body as never);
    const arabic = i % 2 === 0;
    assert.equal(wb.worksheets[0].name, arabic ? "ملخص التقرير" : "Report summary");
    assert.equal(wb.worksheets[0].views[0].rightToLeft, arabic);
    const details = wb.getWorksheet(arabic ? "التبرعات" : "Donations")!;
    assert.equal(details.getCell("I7").value, arabic ? "المملكة العربية السعودية" : "Saudi Arabia");
    assert.ok(wb.getWorksheet(arabic ? "تحليل الاشتراكات" : "Subscription analysis"));
  }
});

test("one donor with several plans is distinct from plan counts; unactivated plans do not inflate forecast", async () => {
  setDashLocale("ar");
  const plans = [subscription(), subscription({ id: "friday", frequency: "FRIDAY", monthlyEquivalentUSD: 4.348214 }),
    subscription({ id: "monthly", frequency: "MONTHLY", monthlyEquivalentUSD: 1 }),
    subscription({ id: "unpaid", totalChargesCount: 0, monthlyEquivalentUSD: 1000 }),
    subscription({ id: "paused", status: "PAUSED", monthlyEquivalentUSD: 1000 }),
    subscription({ id: "cancelled", status: "CANCELLED" }), subscription({ id: "failed", status: "PAYMENT_FAILED" }),
    subscription({ id: "missing", amountUSD: null, monthlyEquivalentUSD: null })];
  const wb = await workbook([], plans), summary = wb.getWorksheet("ملخص الاشتراكات")!;
  assert.equal(metric(summary, "عدد الاشتراكات"), 8);
  assert.equal(metric(summary, "المتبرعون المعروفون"), 1);
  assert.equal(metric(summary, "نشط مؤكد"), 4);
  assert.equal(metric(summary, "بانتظار أول دفعة"), 1);
  assert.equal(metric(summary, "متوقع شهريًا (USD)"), 35.79);
  assert.equal(metric(summary, "نشط بلا قيمة USD"), 1);
  assert.equal(metric(summary, "يومي"), 2);
  assert.equal(metric(summary, "تبرع كل جمعة"), 1);
  assert.equal(metric(summary, "شهري"), 1);
});

test("gateway and recurring breakdowns reconcile gross paid amounts, preserve currencies and disclose missing USD", async () => {
  setDashLocale("ar");
  const rows = [gift({ id: "a", subscriptionId: "daily", type: "MONTHLY", frequency: "DAILY", provider: "PAYPAL", amountUSD: null }),
    gift({ id: "b", subscriptionId: "daily", type: "MONTHLY", frequency: "DAILY", provider: "PAYPAL", status: "FAILED", paidAt: null }),
    gift({ id: "c", provider: "PAYPAL", currency: "EUR", amountUSD: 99, status: "PAID", paidAt: null })];
  const wb = await workbook(rows, [subscription()]);
  const gateways = wb.getWorksheet("بوابات الدفع")!;
  assert.equal(gateways.getCell("E7").value, 2);
  assert.equal(gateways.getCell("F7").value, 1);
  assert.equal(gateways.getCell("G7").value, 1);
  assert.equal(gateways.getCell("I7").value, 50);
  assert.equal(gateways.getCell("M7").value, 35.5);
  assert.equal(gateways.getCell("N7").value, 0);
  assert.equal(gateways.getCell("O7").value, 1);
  assert.equal(gateways.getCell("D8").value, "EUR");
  const analysis = wb.getWorksheet("تحليل الاشتراكات")!;
  assert.equal(analysis.getCell("A7").value, "الولايات المتحدة");
  assert.equal(analysis.getCell("C7").value, "PAYPAL");
  assert.equal(analysis.getCell("P7").value, 1);
  assert.equal(analysis.getCell("Q7").value, 35.5);
  assert.equal(analysis.getCell("S7").value, 1);
  const roster = wb.getWorksheet("الاشتراكات")!;
  assert.equal(roster.getCell("X7").value, "PAYPAL");
  assert.equal(roster.getCell("Y7").value, 1);
  assert.equal(roster.getCell("Z7").value, 35.5);
});

test("plan creation period is independent from lifetime payment totals and CSV report totals", async () => {
  const plans = [subscription(), subscription({ id: "old", createdAt: new Date("2020-01-01") })];
  const out = await buildDonationExport({ language: "en", format: "xlsx", title: "تقرير التبرعات", filters: [],
    donations: [], subscriptions: plans, period: { start: new Date("2026-11-01"), end: new Date("2026-11-30") } });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(out.body as never);
  assert.equal(metric(wb.getWorksheet("Subscription overview")!, "Plans created in the period"), 1);
  const csv = await buildDonationExport({ language: "en", format: "csv", title: "تقرير التبرعات", filters: [],
    donations: [gift({ subscriptionId: "daily" })], subscriptions: plans });
  assert.ok(csv.body.toString().includes("Payments in report results"));
  assert.ok(csv.body.toString().includes("35.5"));
  assert.ok(csv.filenameUtf8.startsWith("Donations report"));
});

test("English workbook has translated headings, notes, and summary labels throughout", async () => {
  const out = await buildDonationExport({ language: "en", format: "xlsx", title: "تقرير التبرعات", filters: [],
    donations: [gift({ donor: { id: "x", name: "Synthetic donor", email: null, phone: null, countryCode: "US" }, campaigns: [] })], subscriptions: [subscription()] });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(out.body as never);
  const untranslated = new Set<string>();
  for (const sheet of wb.worksheets) sheet.eachRow(row => row.eachCell(cell => {
    if (typeof cell.value === "string" && /[\u0600-\u06ff]/.test(cell.value)) untranslated.add(cell.value);
  }));
  assert.deepEqual([...untranslated], []);
});

test("plan loader reads authoritative provider and lifetime paid totals without inferring identities or exchange rates", async () => {
  const { loadReportSubscriptions } = await import("../../lib/dashboard/report-subscriptions");
  const calls: unknown[] = [];
  const client = {
    subscription: { findMany: async (query: { select: Record<string, unknown> }) => {
      calls.push(query);
      if (query.select.frequency) return [{ id: "daily", frequency: "DAILY" }];
      assert.equal(query.select.cardDetails, undefined);
      assert.equal(query.select.paypalVaultId, undefined);
      return [{ id: "daily", status: "ACTIVE", provider: "PAYPAL", amount: 1, amountUSD: 1, currency: "USD", teamSupport: 0,
        paymentMethod: "PAYPAL", createdAt: settled, lastBillingDate: settled, nextBillingDate: settled,
        donor: { id: "one-donor", name: "Synthetic", email: null, phone: null, countryCode: "US" }, items: [], categoryItems: [], referral: null }];
    } },
    donation: { groupBy: async (query: { where: unknown }) => {
      calls.push(query);
      assert.deepEqual(query.where, { subscriptionId: { in: ["daily"] }, status: "PAID", paidAt: { not: null } });
      return [{ subscriptionId: "daily", currency: "USD", _count: { _all: 3, amountUSD: 2 }, _sum: { amount: 3, amountUSD: 2 } }];
    } },
  } as unknown as PrismaClient;
  assert.deepEqual(await loadReportSubscriptions([], client), []);
  assert.equal(calls.length, 0);
  const [plan] = await loadReportSubscriptions(["daily", "daily"], client);
  assert.equal(plan.provider, "PAYPAL");
  assert.equal(plan.frequency, "DAILY");
  assert.equal(plan.monthlyEquivalentUSD, 30.4375);
  assert.equal(plan.totalChargesCount, 3);
  assert.equal(plan.totalChargesMissingUSD, 1);
});

test("projects split actual basket lines, count each payment once and reconcile without support", async () => {
  setDashLocale("ar");
  const wb = await workbook([gift({ amount: 100, teamSupport: 20, totalAmount: 120, amountUSD: 240,
    campaigns: [{ id: "a", title: "أ" }, { id: "b", title: "ب" }],
    projectAllocations: [{ id: "a", title: "أ", amount: 20 }, { id: "a", title: "أ", amount: 10 }, { id: "b", title: "ب", amount: 70 }],
  }), gift({ id: "second", amount: 10, totalAmount: 10, teamSupport: 0, amountUSD: 20,
    projectAllocations: [{ id: "a", title: "أ", amount: 10 }] })]);
  const sheet = wb.getWorksheet("المشاريع")!;
  assert.deepEqual([sheet.getCell("A8").value, sheet.getCell("B8").value, sheet.getCell("C8").value], ["ب", 1, 140]);
  assert.deepEqual([sheet.getCell("A9").value, sheet.getCell("B9").value, sheet.getCell("C9").value], ["أ", 2, 80]);
  assert.equal(Number(sheet.getCell("D8").value) + Number(sheet.getCell("D9").value), 1);
});

test("unallocated legacy baskets retain unknown amounts instead of inventing project shares", async () => {
  setDashLocale("ar");
  const sheet = (await workbook([gift({ campaigns: [{ id: "a", title: "أ" }, { id: "b", title: "ب" }] })])).getWorksheet("المشاريع")!;
  assert.equal(sheet.getCell("A8").value, "غير محدد");
  assert.equal(sheet.getCell("C8").value, 15.5);
});

test("project identity, category lines and unallocated balances remain separate in both report languages", async () => {
  for (const language of ["ar", "en"] as const) {
    const out = await buildDonationExport({ language, format: "xlsx", title: "تقرير التبرعات", filters: [], donations: [gift({
      amount: 100, amountUSD: 110, teamSupport: 10, totalAmount: 110,
      projectAllocations: [{ id: "campaign:a", title: "Same title", amount: 20 }, { id: "campaign:b", title: "Same title", amount: 30 },
        { id: "category:a", title: "Category", amount: 40 }],
    })] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out.body as never);
    const sheet = wb.worksheets[3];
    const amounts: number[] = [];
    for (let row = 8; row <= 11; row++) {
      amounts.push(Number(sheet.getCell(row, 3).value));
      assert.equal(sheet.getCell(row, 2).value, 1);
    }
    assert.deepEqual(amounts, [40, 30, 20, 10]);
    assert.equal(amounts.reduce((a, b) => a + b, 0), 100);
  }
});
