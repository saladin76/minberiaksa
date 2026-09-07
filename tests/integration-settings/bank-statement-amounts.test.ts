import { strict as assert } from "node:assert";
import { test, describe } from "node:test";

import {
  foldTurkish,
  looksLikeIdentifier,
  looksLikeMoneyText,
  parseAmount,
} from "../../lib/bank-transfers/amount-format";
import {
  detectAmountColumn,
  findHeaderRow,
  resolveStatementColumns,
} from "../../lib/bank-transfers/statement-columns";

describe("parseAmount — Turkish and English money formats", () => {
  const cases: [unknown, number | null][] = [
    ["1.234,56", 1234.56],   // TR: dot groups, comma decimal
    ["1,234.56", 1234.56],   // EN: comma groups, dot decimal
    ["1.234", 1234],         // three trailing digits => grouping
    ["12,50", 12.5],
    ["12.50", 12.5],
    ["1.234.567,89", 1234567.89],
    ["₺1.500,00", 1500],
    ["1.500,00 TL", 1500],
    ["2.500,00-", -2500],    // Ziraat writes debits with a trailing minus
    ["-2.500,00", -2500],
    ["(2.500,00)", -2500],
    ["1 234,56", 1234.56],   // space-grouped
    [1234.56, 1234.56],
    ["", null],
    ["   ", null],
    ["ABC", null],
    [null, null],
    [undefined, null],
  ];

  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} -> ${expected}`, () => {
      assert.equal(parseAmount(input), expected);
    });
  }

  test("a trailing minus is not swallowed into NaN", () => {
    // The previous cleaner kept the trailing "-" and Number("1234.56-") is NaN,
    // so these rows silently imported with no amount at all.
    assert.notEqual(parseAmount("1.234,56-"), null);
  });
});

describe("foldTurkish", () => {
  test("dotted and dotless I both fold to i", () => {
    assert.equal(foldTurkish("Tutarı"), "tutari");
    assert.equal(foldTurkish("TUTARI"), "tutari");
    assert.equal(foldTurkish("Tutari"), "tutari");
    assert.equal(foldTurkish("İşlem Tutarı"), "islem tutari");
  });
});

describe("looksLikeIdentifier / looksLikeMoneyText", () => {
  test("reference and account numbers are identifiers, not money", () => {
    assert.equal(looksLikeIdentifier("20250114887"), true);
    assert.equal(looksLikeIdentifier("TR330006100519786457841326"), true);
    assert.equal(looksLikeIdentifier("F1234567"), true);
    assert.equal(looksLikeIdentifier("1.234,56"), false);
  });

  test("money shape needs a decimal part or grouping", () => {
    assert.equal(looksLikeMoneyText("1.234,56"), true);
    assert.equal(looksLikeMoneyText("250,00"), true);
    assert.equal(looksLikeMoneyText("₺500"), true);
    assert.equal(looksLikeMoneyText("20250114887"), false);
    assert.equal(looksLikeMoneyText("7"), false);
  });
});

describe("findHeaderRow", () => {
  test("skips a preamble line that merely mentions a date", () => {
    const rows = [
      ["Ziraat Bankası"],
      ["Rapor Tarihi: 01.01.2026"],                       // <- old code stopped here
      ["Hesap No: 12345678"],
      ["Tarih", "Açıklama", "Tutar", "Bakiye"],           // <- the real header
      ["01.01.2026", "Gelen FAST AHMET", "250,00", "1.250,00"],
    ];
    assert.equal(findHeaderRow(rows), 3);
  });

  test("returns -1 when there is no header at all", () => {
    const rows = [
      ["01.01.2026", "Gelen FAST AHMET", "250,00"],
      ["02.01.2026", "Gelen FAST AYSE", "100,00"],
    ];
    assert.equal(findHeaderRow(rows), -1);
  });
});

describe("resolveStatementColumns — the «Tutar» rule", () => {
  test("uses the Tutar column when the sheet has one", () => {
    const headers = ["Tarih", "Açıklama", "Tutar", "Bakiye"];
    const dataRows = [
      ["01.01.2026", "Gelen FAST AHMET", "250,00", "1.250,00"],
      ["02.01.2026", "Gelen FAST AYSE", "100,00", "1.350,00"],
    ];
    const cols = resolveStatementColumns(headers, dataRows);
    assert.equal(cols.amount, 2);
    assert.equal(cols.amountSource, "header:tutar");
    assert.equal(cols.amountHeader, "Tutar");
  });

  test("«Bakiye Tutarı» never wins the Tutar rule even when it comes first", () => {
    // This is the bug: "Bakiye Tutarı" contains "tutar" and sits to the LEFT of
    // the real column, so first-match-wins imported the running balance.
    const headers = ["Tarih", "Açıklama", "Bakiye Tutarı", "Tutar"];
    const dataRows = [
      ["01.01.2026", "Gelen FAST AHMET", "1.250,00", "250,00"],
      ["02.01.2026", "Gelen FAST AYSE", "1.350,00", "100,00"],
    ];
    const cols = resolveStatementColumns(headers, dataRows);
    assert.equal(cols.amount, 3, "must pick Tutar, not Bakiye Tutarı");
    assert.equal(cols.amountHeader, "Tutar");
  });

  test("Tutar beats Alacak when both are present", () => {
    const headers = ["Tarih", "Açıklama", "Alacak", "Borç", "Tutar"];
    const dataRows = [["01.01.2026", "x", "250,00", "", "250,00"]];
    const cols = resolveStatementColumns(headers, dataRows);
    assert.equal(cols.amount, 4);
    assert.equal(cols.amountSource, "header:tutar");
  });

  test("falls back to the Alacak/Borç pair when there is no Tutar", () => {
    const headers = ["Tarih", "Açıklama", "Alacak", "Borç"];
    const dataRows = [
      ["01.01.2026", "Gelen", "250,00", ""],
      ["02.01.2026", "Giden", "", "80,00"],
    ];
    const cols = resolveStatementColumns(headers, dataRows);
    assert.equal(cols.amount, 2);
    assert.equal(cols.amountSource, "header:credit");
    assert.equal(cols.debit, 3);
  });

  test("case and Turkish letters do not matter", () => {
    for (const header of ["TUTARI", "Tutarı", "tutari", "İşlem Tutarı", "Tutar (TL)"]) {
      const cols = resolveStatementColumns(
        ["Tarih", "Açıklama", header],
        [["01.01.2026", "x", "250,00"]]
      );
      assert.equal(cols.amount, 2, `failed for header ${header}`);
      assert.equal(cols.amountSource, "header:tutar");
    }
  });
});

describe("detectAmountColumn — no usable header", () => {
  test("prefers the money-shaped column over a reference number", () => {
    // col0 date, col1 reference (long digits), col2 description, col3 amount
    const dataRows = [
      ["01.01.2026", "20250114887", "Gelen FAST AHMET", "250,00"],
      ["02.01.2026", "20250114912", "Gelen FAST AYSE", "1.100,50"],
      ["03.01.2026", "20250115003", "Gelen FAST OMER", "75,25"],
    ];
    assert.equal(detectAmountColumn(dataRows), 3);
  });

  test("picks the movement column, not the running balance", () => {
    // col2 is the amount, col3 is a running balance of it.
    const dataRows = [
      ["01.01.2026", "Gelen FAST AHMET", "250,00", "1.250,00"],
      ["02.01.2026", "Gelen FAST AYSE", "100,00", "1.350,00"],
      ["03.01.2026", "Gelen FAST OMER", "50,00", "1.400,00"],
      ["04.01.2026", "Gelen FAST ALI", "25,00", "1.425,00"],
      ["05.01.2026", "Gelen FAST VELI", "75,00", "1.500,00"],
    ];
    assert.equal(detectAmountColumn(dataRows), 2);
  });

  test("ignores a constant column", () => {
    const dataRows = [
      ["01.01.2026", "TRY", "250,00"],
      ["02.01.2026", "TRY", "100,00"],
      ["03.01.2026", "TRY", "50,00"],
    ];
    assert.equal(detectAmountColumn(dataRows), 2);
  });
});
