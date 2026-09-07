import crypto from "crypto";
import { looksLikeIdentifier, looksLikeMoneyText, parseAmount } from "./amount-format";
import {
  NO_COLUMNS,
  findHeaderRow,
  resolveStatementColumns,
  type ResolvedColumns,
} from "./statement-columns";

export const BANK_TRANSFER_CURRENCIES = ["USD", "TRY", "EUR"] as const;
export const BANK_TRANSFER_DONOR_LOCALES = ["ar", "tr", "en", "fr", "de", "es", "pt", "id"] as const;

export type BankTransferCurrency = (typeof BANK_TRANSFER_CURRENCIES)[number];
export type BankTransferDonorLocale = (typeof BANK_TRANSFER_DONOR_LOCALES)[number];

export type ParsedBankTransferRow = {
  rowNumber: number;
  transactionDate: string | null;
  description: string;
  donorName: string | null;
  amount: number | null;
  currency: BankTransferCurrency;
  donorLocale: BankTransferDonorLocale;
  direction: "CREDIT" | "DEBIT" | "UNKNOWN";
  reference: string | null;
  suggestedProject: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  transactionHash: string;
  raw: string[];
};

export type ParsedBankStatement = {
  parser: "spreadsheet" | "pdf";
  fileHash: string;
  bankIban: string | null;
  rows: ParsedBankTransferRow[];
  warning: string | null;
  /**
   * Which column the amounts came from. Surfaced so the admin can confirm the
   * importer read the right one before committing — a silently wrong amount
   * column is the failure mode that is hardest to notice after the fact.
   */
  amountColumn: { source: ResolvedColumns["amountSource"]; header: string | null };
};

export function normalizeBankTransferCurrency(value: unknown): BankTransferCurrency {
  const upper = typeof value === "string" ? value.trim().toUpperCase() : "USD";
  return BANK_TRANSFER_CURRENCIES.includes(upper as BankTransferCurrency) ? upper as BankTransferCurrency : "USD";
}

export function normalizeBankTransferDonorLocale(value: unknown): BankTransferDonorLocale {
  const lower = typeof value === "string" ? value.trim().toLowerCase() : "ar";
  return BANK_TRANSFER_DONOR_LOCALES.includes(lower as BankTransferDonorLocale) ? lower as BankTransferDonorLocale : "ar";
}

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/\s+/g, " ").trim();
}

function compact(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function extractIbanFromText(text: string): string | null {
  const match = text.match(/TR[\s\d]{24,40}/i);
  if (!match) return null;
  const iban = match[0].replace(/\s+/g, "").toUpperCase();
  return /^TR\d{24}$/.test(iban) ? iban : null;
}

function looksLikeDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = normalizeCell(value);
  if (!raw) return null;
  const iso = raw.match(/\b(20\d{2}|19\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = raw.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|19\d{2})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return null;
}

function amountTokens(text: string): number[] {
  const matches = text.match(/[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})|[-+]?\d+(?:[.,]\d{1,2})/g) ?? [];
  return matches.map(parseAmount).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
}

/**
 * Last-resort per-row amount pick, used only when the resolved amount column is
 * blank for this row. Skips the date/reference/description columns and anything
 * that reads like an identifier, then prefers a money-shaped cell (one with a
 * decimal part or thousands grouping) over a bare integer.
 */
function pickAmountFromRow(row: unknown[], cols: ResolvedColumns): number | null {
  const skip = new Set([cols.date, cols.description, cols.donor, cols.reference].filter((i) => i >= 0));
  const candidates: { value: number; money: boolean }[] = [];

  for (let i = 0; i < row.length; i += 1) {
    if (skip.has(i)) continue;
    const cell = row[i];
    if (looksLikeIdentifier(cell)) continue;
    if (looksLikeDate(cell)) continue;
    const n = parseAmount(cell);
    if (n === null || Math.abs(n) === 0) continue;
    candidates.push({ value: n, money: looksLikeMoneyText(cell) });
  }

  if (!candidates.length) return null;
  const moneyShaped = candidates.find((c) => c.money);
  return (moneyShaped ?? candidates[0]).value;
}

function extractDonorName(description: string): string | null {
  const patterns = [
    /gönderen\s*[:：]\s*([^,;]+)/i,
    /gond[eı]ren\s*[:：]\s*([^,;]+)/i,
    /gönd\.?\s*[:：]\s*([^,;]+)/i,
    /gond\.?\s*[:：]\s*([^,;]+)/i,
    /sender\s*[:：]\s*([^,;]+)/i,
    /المرسل\s*[:：]\s*([^,;]+)/i,
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match?.[1]?.trim()) return match[1].replace(/\s+/g, " ").trim();
  }

  const mobileTransfer = description.match(/^([A-ZÇĞİÖŞÜ\s.]{5,80})\s+(?:Ziraat|Mobil|Havale|EFT|FAST)/i);
  if (mobileTransfer?.[1]?.trim()) return mobileTransfer[1].replace(/\s+/g, " ").trim();
  return null;
}

function suggestProject(description: string): { project: string; confidence: ParsedBankTransferRow["confidence"] } {
  const d = description.toLowerCase();
  if (!d.trim()) return { project: "تبرع عام", confidence: "LOW" };
  if (/afrika|africa|أفريقيا|افريقيا/.test(d)) return { project: "إفريقيا", confidence: "MEDIUM" };
  if (/filistin|palestine|فلسطين|gazze|gaza|غزة/.test(d)) return { project: "فلسطين / غزة", confidence: "MEDIUM" };
  if (/sadaka|sadaqa|infak|bağış|bagis|bağis|تبرع|صدقة|صدقه/.test(d)) return { project: "تبرع عام", confidence: "MEDIUM" };
  if (/zakat|zekat|زكاة|زكاه/.test(d)) return { project: "زكاة", confidence: "MEDIUM" };
  if (/kurban|qurban|أضحية|اضحية|قربان/.test(d)) return { project: "الأضاحي / القربان", confidence: "MEDIUM" };
  if (/yetim|orphan|يتيم|ايتام|أيتام/.test(d)) return { project: "كفالة الأيتام", confidence: "MEDIUM" };
  if (/ameliyat|surgery|عملية|عمليه|medical|طبي|علاج/.test(d)) return { project: "المشاريع الطبية", confidence: "MEDIUM" };
  return { project: "تبرع عام", confidence: "LOW" };
}

function makeTransactionHash(input: {
  bankId: string;
  bankIban: string | null;
  transactionDate: string | null;
  reference: string | null;
  amount: number | null;
  currency: BankTransferCurrency;
  description: string;
}) {
  return sha256([
    input.bankId,
    input.bankIban ?? "",
    input.transactionDate ?? "",
    input.reference ?? "",
    input.amount === null ? "" : input.amount.toFixed(2),
    input.currency,
    compact(input.description),
  ].join("|"));
}

function rowToPreview(row: unknown[], rowNumber: number, args: { currency: BankTransferCurrency; donorLocale: BankTransferDonorLocale; bankId: string; bankIban: string | null; columns?: ResolvedColumns }): ParsedBankTransferRow | null {
  const cells = row.map(normalizeCell);
  if (cells.every((c) => !c)) return null;

  // Columns are resolved once for the whole sheet (see statement-columns.ts)
  // rather than re-derived per row from a first-keyword-wins scan.
  const cols = args.columns ?? NO_COLUMNS;

  const transactionDate = cols.date >= 0 ? looksLikeDate(row[cols.date]) : cells.map(looksLikeDate).find(Boolean) ?? null;
  const description = cols.description >= 0 ? cells[cols.description] : cells.slice(0, 10).join(" | ");
  const donorName = cols.donor >= 0 ? cells[cols.donor] || extractDonorName(description) : extractDonorName(description);
  const reference = cols.reference >= 0 ? cells[cols.reference] || null : null;

  // The resolved amount column wins. When it holds a «Tutar»-style signed
  // figure the sign carries the direction; an «Alacak»/«Borç» pair carries it
  // in which of the two is filled.
  const primary = cols.amount >= 0 ? parseAmount(row[cols.amount]) : null;
  const debit = cols.debit >= 0 ? parseAmount(row[cols.debit]) : null;

  let amount: number | null = null;
  let direction: ParsedBankTransferRow["direction"] = "UNKNOWN";

  if (primary !== null && Math.abs(primary) > 0) {
    amount = primary;
    direction = primary < 0 ? "DEBIT" : "CREDIT";
  } else if (debit !== null && Math.abs(debit) > 0) {
    amount = Math.abs(debit);
    direction = "DEBIT";
  }

  // Only when the resolved column is empty on this row do we fall back to
  // scanning the row — and even then identifiers are excluded, so a reference
  // number can no longer be imported as the donation figure.
  if (amount === null) {
    const likely = pickAmountFromRow(row, cols);
    if (likely !== null) {
      amount = likely;
      direction = likely < 0 ? "DEBIT" : "CREDIT";
    }
  }

  const lowerDescription = description.toLowerCase();
  if (lowerDescription.includes("devir bakiyesi") || lowerDescription.includes("toplam")) return null;

  const suggestion = suggestProject(description);
  return {
    rowNumber,
    transactionDate,
    description,
    donorName: donorName || null,
    amount: amount === null ? null : Math.abs(amount),
    currency: args.currency,
    donorLocale: args.donorLocale,
    direction,
    reference,
    suggestedProject: suggestion.project,
    confidence: suggestion.confidence,
    transactionHash: makeTransactionHash({ bankId: args.bankId, bankIban: args.bankIban, transactionDate, reference, amount: amount === null ? null : Math.abs(amount), currency: args.currency, description }),
    raw: cells,
  };
}

function parseTurkishStatementLine(line: string, rowNumber: number, args: { currency: BankTransferCurrency; donorLocale: BankTransferDonorLocale; bankId: string; bankIban: string | null }): ParsedBankTransferRow | null {
  const transactionDate = looksLikeDate(line);
  if (!transactionDate) return null;
  const refMatch = line.match(/\b([A-Z]\d[A-Z0-9]{2,}|F\d{4,}|[A-Z0-9]{4,})\b/);
  const reference = refMatch?.[1] ?? null;
  const amounts = amountTokens(line);
  if (amounts.length < 2) return null;
  const amountToken = amounts[amounts.length - 2];
  const amount = Math.abs(amountToken);
  const direction = amountToken < 0 || /\s-\s*\d|\s-\d/.test(line) ? "DEBIT" : "CREDIT";
  const description = line
    .replace(/^\d{1,2}[./-]\d{1,2}[./-]\d{4}\s*/, "")
    .replace(reference ?? "", "")
    .trim();
  const suggestion = suggestProject(description);
  const donorName = extractDonorName(description);

  return {
    rowNumber,
    transactionDate,
    description,
    donorName,
    amount,
    currency: args.currency,
    donorLocale: args.donorLocale,
    direction,
    reference,
    suggestedProject: suggestion.project,
    confidence: suggestion.confidence,
    transactionHash: makeTransactionHash({ bankId: args.bankId, bankIban: args.bankIban, transactionDate, reference, amount, currency: args.currency, description }),
    raw: [line],
  };
}

async function parseSpreadsheet(
  buffer: Buffer,
  args: { currency: BankTransferCurrency; donorLocale: BankTransferDonorLocale; bankId: string; bankIban: string | null }
): Promise<{ rows: ParsedBankTransferRow[]; columns: ResolvedColumns }> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { rows: [], columns: NO_COLUMNS };
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false }) as unknown[][];

  const headerRowIndex = findHeaderRow(rows);
  const headers = headerRowIndex >= 0 ? rows[headerRowIndex].map(normalizeCell) : undefined;
  const dataRows = (headerRowIndex >= 0 ? rows.slice(headerRowIndex + 1) : rows).slice(0, 1000);

  // Resolve the layout once, from the header plus the data, then apply it to
  // every row — so all rows agree on which column the money is in.
  const columns = resolveStatementColumns(headers, dataRows);

  const parsed = dataRows
    .map((row, index) => rowToPreview(row, (headerRowIndex >= 0 ? headerRowIndex + 2 : 1) + index, { ...args, columns }))
    .filter((row): row is ParsedBankTransferRow => Boolean(row));

  return { rows: parsed, columns };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const mod = await import("pdf-parse");
  const pdfParse = (mod as unknown as { default?: (b: Buffer) => Promise<{ text?: string }> } & ((b: Buffer) => Promise<{ text?: string }>)).default ?? mod as unknown as (b: Buffer) => Promise<{ text?: string }>;
  const result = await pdfParse(buffer);
  return result.text ?? "";
}

async function parsePdf(buffer: Buffer, args: { currency: BankTransferCurrency; donorLocale: BankTransferDonorLocale; bankId: string; bankIban: string | null }): Promise<ParsedBankTransferRow[]> {
  const text = await extractPdfText(buffer);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const parsed = lines
    .slice(0, 1000)
    .map((line, index) => parseTurkishStatementLine(line, index + 1, args))
    .filter((row): row is ParsedBankTransferRow => Boolean(row));

  if (parsed.length) return parsed;

  return lines
    .slice(0, 500)
    .map((line, index) => {
      const date = looksLikeDate(line);
      const amounts = amountTokens(line);
      const amountToken = amounts.find((n) => Math.abs(n) > 0) ?? null;
      const amount = amountToken === null ? null : Math.abs(amountToken);
      const suggestion = suggestProject(line);
      return {
        rowNumber: index + 1,
        transactionDate: date,
        description: line,
        donorName: extractDonorName(line),
        amount,
        currency: args.currency,
        donorLocale: args.donorLocale,
        direction: amountToken === null ? "UNKNOWN" : amountToken < 0 ? "DEBIT" : "CREDIT",
        reference: null,
        suggestedProject: suggestion.project,
        confidence: suggestion.confidence,
        transactionHash: makeTransactionHash({ bankId: args.bankId, bankIban: args.bankIban, transactionDate: date, reference: null, amount, currency: args.currency, description: line }),
        raw: [line],
      } satisfies ParsedBankTransferRow;
    });
}

export async function parseBankStatementFile(args: {
  buffer: Buffer;
  fileName: string;
  currency: BankTransferCurrency;
  donorLocale: BankTransferDonorLocale;
  bankId: string;
}): Promise<ParsedBankStatement> {
  const fileHash = sha256(args.buffer);
  const lower = args.fileName.toLowerCase();
  let textForIban = "";
  let parser: ParsedBankStatement["parser"];
  let warning: string | null = null;

  if (lower.endsWith(".pdf")) {
    parser = "pdf";
    textForIban = await extractPdfText(args.buffer).catch(() => "");
  } else {
    parser = "spreadsheet";
    textForIban = args.buffer.toString("utf8");
  }

  const bankIban = extractIbanFromText(textForIban);
  const commonArgs = { currency: args.currency, donorLocale: args.donorLocale, bankId: args.bankId, bankIban };
  let rows: ParsedBankTransferRow[];
  let columns: ResolvedColumns = NO_COLUMNS;

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) {
    const result = await parseSpreadsheet(args.buffer, commonArgs);
    rows = result.rows;
    columns = result.columns;
    if (columns.amountSource === "none") {
      warning = "تعذّر تحديد عمود المبلغ في هذا الملف. راجع القيم قبل الاستيراد.";
    } else if (columns.amountSource === "detected") {
      warning = "لم يُعثر على عمود «Tutar»، فتم استنتاج عمود المبلغ من البيانات. راجع القيم قبل الاستيراد.";
    }
  } else if (lower.endsWith(".pdf")) {
    rows = await parsePdf(args.buffer, commonArgs);
    if (!textForIban.trim() || rows.length === 0) {
      warning = "هذا PDF يبدو ممسوحًا أو غير نصي. قراءة ملفات PDF المصورة تحتاج OCR في مرحلة لاحقة.";
    } else {
      warning = "تمت قراءة PDF نصي. إذا كان الملف ممسوحًا Scanner فقد تحتاج النتائج إلى OCR لاحقًا.";
    }
  } else {
    throw new Error("Unsupported file type");
  }

  return {
    parser,
    fileHash,
    bankIban,
    rows,
    warning,
    amountColumn: { source: columns.amountSource, header: columns.amountHeader },
  };
}
