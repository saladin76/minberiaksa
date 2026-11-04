import test from "node:test";
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
    for (const sheetName of [dt("ملخص التقرير"), dt("التحليلات")]) {
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
  assert.equal(wb.worksheets.length, 3);
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
