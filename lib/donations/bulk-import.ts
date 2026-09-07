import "server-only";
import crypto from "crypto";
import * as XLSX from "xlsx";
import { countryNameToCode } from "@/lib/geo/country-name-to-code";

/**
 * Bulk donation import — parse an admin-uploaded Excel/CSV export (Turkish headers like the PayFor
 * sales sheet) into normalized donation rows that map onto the Prisma `Donation` + `User` schema.
 *
 * This module ONLY parses/normalizes/validates — it never writes to the DB and never sends anything.
 * The commit route creates donors (deduped by email) + donations. Imported donations are historical
 * records: they are marked `provider="IMPORT"` and never trigger dispatch / CAPI / receipts.
 */

export const IMPORT_PROVIDER = "IMPORT";
/** providerOrderId prefix so imported rows are fully isolated from real PayFor OrderIds. */
export const IMPORT_ORDER_PREFIX = "BULK:";

export const IMPORT_CURRENCIES = ["USD", "TRY", "EUR"] as const;
export type ImportCurrency = (typeof IMPORT_CURRENCIES)[number];
export const IMPORT_LOCALES = ["ar", "tr", "en", "fr", "de", "es", "pt", "id"] as const;
export type ImportLocale = (typeof IMPORT_LOCALES)[number];

export type ParsedDonationRow = {
  rowNumber: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  basket: string | null;
  amount: number | null;
  currency: ImportCurrency;
  amountUSD: number | null;
  status: "PAID" | "FAILED";
  createdAtISO: string | null;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  locale: ImportLocale;
  keyId: string | null;
  errorCode: string | null;
  usdRate: number | null;
  euroRate: number | null;
  /** Per-row reference tag (source KEYID or a content hash + row number) stored as providerOrderId. */
  dedupKey: string;
  /** Whether this row is safe to import (has email + a positive amount). Repeats are allowed. */
  valid: boolean;
  issues: string[];
  raw: Record<string, string>;
};

export type ParsedDonationSheet = {
  fileHash: string;
  totalRows: number;
  rows: ParsedDonationRow[];
  headerMap: Record<string, number>;
  warnings: string[];
};

/* ─────────────────────────── header mapping ─────────────────────────── */

/** Uppercase + strip Turkish diacritics + collapse whitespace, so header matching is robust. */
function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/İ/g, "I").replace(/ı/g, "I")
    .replace(/[Şş]/g, "S").replace(/[Ğğ]/g, "G")
    .replace(/[Üü]/g, "U").replace(/[Öö]/g, "O").replace(/[Çç]/g, "C")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

type CanonicalKey =
  | "name" | "email" | "phone" | "basket" | "amount" | "currency" | "amountUSD"
  | "status" | "dateTime" | "country" | "keyId" | "usdRate" | "euroRate"
  | "errorCode" | "region" | "locale" | "dateOnly" | "timeOnly";

const HEADER_ALIASES: Record<CanonicalKey, string[]> = {
  name: ["AD SOYAD", "ADSOYAD", "ISIM", "NAME", "FULL NAME", "DONOR", "DONOR NAME"],
  email: ["EPOSTA", "E POSTA", "EMAIL", "E MAIL", "MAIL"],
  phone: ["TELEFON", "PHONE", "GSM", "MOBILE"],
  basket: ["SEPET", "BASKET", "CART", "PROJECT", "CAMPAIGN", "PROJE"],
  amount: ["TOPLAM", "TUTAR", "AMOUNT", "TOTAL"],
  currency: ["PARA BIRIMI", "CURRENCY", "DOVIZ"],
  amountUSD: ["USD HALI", "USD", "AMOUNTUSD", "USD AMOUNT", "USD TUTAR"],
  status: ["DURUM", "STATUS", "STATE"],
  dateTime: ["TARIH SAAT", "DATETIME", "DATE TIME", "TIMESTAMP"],
  country: ["ULKE", "COUNTRY"],
  keyId: ["KEYID", "KEY ID", "KEY", "TRANSACTION ID", "TXID", "TXN ID", "ORDER ID", "ORDERID"],
  usdRate: ["USDKUR", "USD KUR", "USD RATE"],
  euroRate: ["EUROKUR", "EURO KUR", "EUR RATE", "EURO RATE"],
  errorCode: ["ERRORCODE", "ERROR CODE", "ERROR"],
  region: ["BOLGE", "REGION", "STATE PROVINCE", "PROVINCE"],
  locale: ["SITE DIL", "LANG", "LANGUAGE", "LOCALE", "DIL"],
  dateOnly: ["TARIH", "DATE"],
  timeOnly: ["SAAT", "TIME"],
};

/** Find the header row (first row that matches at least the email or amount column) and map columns. */
function buildHeaderMap(matrix: unknown[][]): { headerRowIndex: number; map: Partial<Record<CanonicalKey, number>> } {
  for (let r = 0; r < Math.min(matrix.length, 10); r += 1) {
    const row = matrix[r] ?? [];
    const normalized = row.map(normalizeHeader);
    const map: Partial<Record<CanonicalKey, number>> = {};
    for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [CanonicalKey, string[]][]) {
      const idx = normalized.findIndex((cell) => aliases.includes(cell));
      if (idx >= 0) map[key] = idx;
    }
    // A real header row must include at least email or amount and one of name/keyId.
    if ((map.email !== undefined || map.amount !== undefined) && (map.name !== undefined || map.keyId !== undefined)) {
      return { headerRowIndex: r, map };
    }
  }
  return { headerRowIndex: -1, map: {} };
}

/* ─────────────────────────── value normalizers ─────────────────────────── */

function cell(row: unknown[], idx: number | undefined): string {
  if (idx === undefined) return "";
  const v = row[idx];
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).replace(/\s+/g, " ").trim();
}

function parseNumber(value: string): number | null {
  if (!value) return null;
  let s = value.replace(/[^\d.,\-]/g, "");
  if (!s) return null;
  // "1.234,56" → thousands "." + decimal "," ; "8,56" → decimal "," ; "8.56" → decimal "."
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeCurrency(value: string): ImportCurrency {
  const v = value.trim().toUpperCase();
  if (v === "$" || v === "USD" || v === "US$" || v === "DOLLAR") return "USD";
  if (v === "TL" || v === "₺" || v === "TRY" || v === "TRL" || v === "LİRA" || v === "LIRA") return "TRY";
  if (v === "€" || v === "EUR" || v === "EURO") return "EUR";
  return (IMPORT_CURRENCIES as readonly string[]).includes(v) ? (v as ImportCurrency) : "USD";
}

function normalizeLocale(value: string): ImportLocale {
  const v = value.trim().toLowerCase();
  return (IMPORT_LOCALES as readonly string[]).includes(v) ? (v as ImportLocale) : "ar";
}

/** DURUM "Başarılı"→PAID, "Başarısız"→FAILED. Falls back to errorCode success markers. */
function normalizeStatus(durum: string, errorCode: string): "PAID" | "FAILED" {
  const d = normalizeHeader(durum); // uppercased, diacritics stripped → "BASARILI" / "BASARISIZ"
  if (d.includes("BASARISIZ") || d.includes("FAIL") || d.includes("RED") || d.includes("ERROR")) return "FAILED";
  if (d.includes("BASARILI") || d.includes("SUCCESS") || d.includes("PAID") || d.includes("OK")) return "PAID";
  const e = errorCode.trim().toLowerCase();
  if (e === "success" || e === "0000" || e === "00" || e === "0") return "PAID";
  if (e) return "FAILED";
  return "FAILED";
}

/** Parse "dd.mm.yyyy HH:mm:ss" (or separate date + time) → ISO string (UTC). */
function parseDateTime(dateTime: string, dateOnly: string, timeOnly: string): string | null {
  const source = dateTime || [dateOnly, timeOnly].filter(Boolean).join(" ");
  if (!source) return null;
  const m = source.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = m;
    const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, +ss));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const iso = new Date(source);
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/* ─────────────────────────── main parse ─────────────────────────── */

export function parseDonationImportBuffer(buffer: Buffer): ParsedDonationSheet {
  const fileHash = sha256(buffer.toString("binary")).slice(0, 32);
  const warnings: string[] = [];

  let matrix: unknown[][] = [];
  try {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { fileHash, totalRows: 0, rows: [], headerMap: {}, warnings: ["الملف لا يحتوي على أوراق بيانات."] };
    matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: "" });
  } catch {
    return { fileHash, totalRows: 0, rows: [], headerMap: {}, warnings: ["تعذّر قراءة الملف. تأكد أنه Excel (.xlsx) أو CSV صالح."] };
  }

  const { headerRowIndex, map } = buildHeaderMap(matrix);
  if (headerRowIndex < 0) {
    return { fileHash, totalRows: 0, rows: [], headerMap: {}, warnings: ["تعذّر التعرّف على صف العناوين. تأكد من وجود أعمدة مثل EPOSTA و TOPLAM."] };
  }
  if (map.email === undefined) warnings.push("لا يوجد عمود بريد إلكتروني (EPOSTA) — الصفوف بدون بريد ستُستبعد.");
  if (map.amountUSD === undefined) warnings.push("لا يوجد عمود USD HALİ — سيُحتسب المبلغ بالدولار من المبلغ الأصلي إن أمكن.");

  const rows: ParsedDonationRow[] = [];

  for (let r = headerRowIndex + 1; r < matrix.length; r += 1) {
    const row = matrix[r] ?? [];
    const raw: Record<string, string> = {};
    for (const [key, idx] of Object.entries(map) as [CanonicalKey, number][]) raw[key] = cell(row, idx);

    // Skip fully-empty rows.
    if (Object.values(raw).every((v) => !v)) continue;

    const email = cell(row, map.email).toLowerCase();
    const amount = parseNumber(cell(row, map.amount));
    const currency = normalizeCurrency(cell(row, map.currency));
    let amountUSD = parseNumber(cell(row, map.amountUSD));
    if (amountUSD === null && currency === "USD") amountUSD = amount;
    const country = cell(row, map.country) || null;
    const status = normalizeStatus(cell(row, map.status), cell(row, map.errorCode));
    const createdAtISO = parseDateTime(cell(row, map.dateTime), cell(row, map.dateOnly), cell(row, map.timeOnly));
    const keyId = cell(row, map.keyId) || null;

    const issues: string[] = [];
    if (!email) issues.push("لا يوجد بريد إلكتروني");
    else if (!isEmail(email)) issues.push("بريد إلكتروني غير صالح");
    if (amount === null || amount <= 0) issues.push("مبلغ غير صالح");

    // Reference tag for the created donation (providerOrderId). Repeats are ALLOWED — every row is
    // imported, so this is made unique per row (row number suffix) rather than used to skip anything.
    const dedupBasis = keyId || `${email}|${amountUSD ?? amount ?? ""}|${createdAtISO ?? ""}|${cell(row, map.basket)}`;
    const dedupKey = `${keyId ?? `hash:${sha256(dedupBasis).slice(0, 16)}`}#${r + 1}`;

    rows.push({
      rowNumber: r + 1,
      name: cell(row, map.name) || null,
      email: email || null,
      phone: cell(row, map.phone) || null,
      basket: cell(row, map.basket) || null,
      amount,
      currency,
      amountUSD,
      status,
      createdAtISO,
      country,
      countryCode: countryNameToCode(country),
      region: cell(row, map.region) || null,
      locale: normalizeLocale(cell(row, map.locale)),
      keyId,
      errorCode: cell(row, map.errorCode) || null,
      usdRate: parseNumber(cell(row, map.usdRate)),
      euroRate: parseNumber(cell(row, map.euroRate)),
      dedupKey,
      valid: issues.length === 0,
      issues,
      raw,
    });
  }

  return { fileHash, totalRows: rows.length, rows, headerMap: map as Record<string, number>, warnings };
}

/** Stable provider order id for a row (isolated from real PayFor OrderIds). */
export function importOrderId(dedupKey: string): string {
  return `${IMPORT_ORDER_PREFIX}${dedupKey}`;
}
