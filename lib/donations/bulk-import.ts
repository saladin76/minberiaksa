import * as XLSX from "xlsx";
import { countryNameToCode } from "@/lib/geo/country-name-to-code";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";

/**
 * Bulk donation import  parse an admin-uploaded Excel/CSV export (Turkish headers like the PayFor
 * sales sheet) into normalized donation rows that map onto the Prisma `Donation` + `User` schema.
 *
 * This module ONLY parses/normalizes/validates  it never writes to the DB and never sends anything.
 * It is isomorphic: the dashboard parses the file IN THE BROWSER and posts normalized rows to the
 * commit route in small batches, because a whole large workbook exceeds Vercel's 4.5MB request-body
 * limit and its function timeout. The server never trusts those rows  `sanitizeImportRow` re-checks
 * every field. Imported donations are historical records: they are marked `provider="IMPORT"` and
 * never trigger dispatch / CAPI / receipts.
 */

export const IMPORT_PROVIDER = "IMPORT";
/** providerOrderId prefix so imported rows are fully isolated from real PayFor OrderIds. */
export const IMPORT_ORDER_PREFIX = "BULK:";

export const IMPORT_CURRENCIES = ["USD", "TRY", "EUR"] as const;
export type ImportCurrency = (typeof IMPORT_CURRENCIES)[number];
/** Every site language, from the single locale source (was a local list of 8). */
export const IMPORT_LOCALES = SUPPORTED_LOCALES;
export type ImportLocale = SupportedLocale;

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

/** cyrb53  a fast, non-cryptographic 53-bit hash; only used for reference tags, never for security. */
function cyrb53(input: string | Uint8Array, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i += 1) {
    const ch = typeof input === "string" ? input.charCodeAt(i) : input[i];
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** 28 hex chars from two seeded cyrb53 passes. */
function hashHex(input: string | Uint8Array): string {
  return [cyrb53(input, 1), cyrb53(input, 2)].map((h) => h.toString(16).padStart(14, "0")).join("");
}

/* ─────────────────────────── main parse ─────────────────────────── */

export function parseDonationImportBuffer(data: ArrayBuffer | Uint8Array): ParsedDonationSheet {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const fileHash = hashHex(bytes);
  const warnings: string[] = [];

  let matrix: unknown[][] = [];
  try {
    const wb = XLSX.read(bytes, { type: "array", cellDates: true });
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
  if (map.email === undefined) warnings.push("لا يوجد عمود بريد إلكتروني (EPOSTA)  الصفوف بدون بريد ستُستبعد.");
  if (map.amountUSD === undefined) warnings.push("لا يوجد عمود USD HALİ  سيُحتسب المبلغ بالدولار من المبلغ الأصلي إن أمكن.");

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

    // Reference tag for the created donation (providerOrderId). Repeats are ALLOWED  every row is
    // imported, so this is made unique per row (row number suffix) rather than used to skip anything.
    const dedupBasis = keyId || `${email}|${amountUSD ?? amount ?? ""}|${createdAtISO ?? ""}|${cell(row, map.basket)}`;
    const dedupKey = `${keyId ?? `hash:${hashHex(dedupBasis).slice(0, 16)}`}#${r + 1}`;

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

/**
 * Provider order id for a row (isolated from real PayFor OrderIds). `runId` is minted once per
 * import run, so a retried batch is recognised and skipped, while uploading the same file again
 * later is a new run and imports again (repeats are allowed by design).
 */
export function importOrderId(runId: string, dedupKey: string): string {
  return `${IMPORT_ORDER_PREFIX}${runId}:${dedupKey}`;
}

export const IMPORT_RUN_ID_RE = /^[a-z0-9]{8,40}$/i;

/** The row shape the browser posts to the commit route  a ParsedDonationRow without the display-only fields. */
export type ImportRowInput = Omit<ParsedDonationRow, "valid" | "issues" | "raw">;

export function toImportRowInput({ valid: _valid, issues: _issues, raw: _raw, ...row }: ParsedDonationRow): ImportRowInput {
  return row;
}

function text(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const t = value.replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Server-side re-validation of a client-posted row. Returns null when the row is not importable
 * (no valid email / no positive amount / no reference). Enumerations are clamped, the country code
 * is re-derived from the country name, and free text is length-capped  nothing is taken on trust.
 */
export function sanitizeImportRow(input: unknown): ImportRowInput | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const email = text(o.email, 254)?.toLowerCase() ?? null;
  const amount = finiteOrNull(o.amount);
  const dedupKey = text(o.dedupKey, 200);
  if (!email || !isEmail(email) || amount === null || amount <= 0 || !dedupKey) return null;
  const createdRaw = text(o.createdAtISO, 40);
  const created = createdRaw ? new Date(createdRaw) : null;
  const country = text(o.country, 100);
  return {
    rowNumber: finiteOrNull(o.rowNumber) ?? 0,
    name: text(o.name, 200),
    email,
    phone: text(o.phone, 50),
    basket: text(o.basket, 500),
    amount,
    currency: (IMPORT_CURRENCIES as readonly unknown[]).includes(o.currency) ? (o.currency as ImportCurrency) : "USD",
    amountUSD: finiteOrNull(o.amountUSD),
    status: o.status === "PAID" ? "PAID" : "FAILED",
    createdAtISO: created && !Number.isNaN(created.getTime()) ? created.toISOString() : null,
    country,
    countryCode: countryNameToCode(country),
    region: text(o.region, 100),
    locale: (IMPORT_LOCALES as readonly unknown[]).includes(o.locale) ? (o.locale as ImportLocale) : "ar",
    keyId: text(o.keyId, 200),
    errorCode: text(o.errorCode, 100),
    usdRate: finiteOrNull(o.usdRate),
    euroRate: finiteOrNull(o.euroRate),
    dedupKey,
  };
}
