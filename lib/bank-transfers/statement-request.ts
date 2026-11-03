import {
  normalizeBankTransferCurrency,
  normalizeBankTransferDonorLocale,
  parseBankStatementFile,
} from "./statement-parser";
import { enhanceBankTransferRowsSmart } from "./smart-enhancer";
import { StatementReviewError } from "./statement-import";

export async function readStatementForm(form: FormData) {
  const file = form.get("file");
  const bankId = String(form.get("bankId") ?? "").trim();
  if (!bankId) throw new StatementReviewError("STATEMENT_BANK_REQUIRED");
  if (!(file instanceof File) || file.size === 0)
    throw new StatementReviewError("STATEMENT_FILE_REQUIRED");
  if (file.size > 8 * 1024 * 1024)
    throw new StatementReviewError("STATEMENT_FILE_TOO_LARGE");
  if (!/\.(xlsx|xls|csv|pdf)$/i.test(file.name))
    throw new StatementReviewError("STATEMENT_FILE_UNSUPPORTED");
  const currency = normalizeBankTransferCurrency(form.get("currency"));
  const donorLocale = normalizeBankTransferDonorLocale(
    form.get("donorLocale") ?? form.get("statementLocale"),
  );
  const sheetName = String(form.get("sheetName") ?? "").trim();
  const parsed = await parseBankStatementFile({
    buffer: Buffer.from(await file.arrayBuffer()),
    fileName: file.name,
    bankId,
    currency,
    donorLocale,
    sheetName: sheetName || undefined,
  });
  parsed.rows = enhanceBankTransferRowsSmart(parsed.rows);
  const list = (field: string): unknown[] => {
    try {
      const value = JSON.parse(String(form.get(field) ?? "[]"));
      if (Array.isArray(value)) return value;
    } catch {
      /* invalid choices must not silently include rows */
    }
    throw new StatementReviewError("STATEMENT_SELECTION_INVALID");
  };
  const excludedRows = new Set(
    list("excludedRows").filter(
      (n): n is number => Number.isSafeInteger(n) && Number(n) > 0,
    ),
  );
  const excludedHashes = new Set(
    list("excludedHashes").filter(
      (n): n is string => typeof n === "string" && /^[a-f\d]{64}$/.test(n),
    ),
  );
  const binding = {
    fileHash: parsed.fileHash,
    bankId,
    currency,
    donorLocale,
    sheetName: parsed.sheetName ?? "",
    parserVersion: parsed.parserVersion ?? 1,
  };
  return {
    file,
    bankId,
    currency,
    donorLocale,
    parsed,
    binding,
    excludedRows,
    excludedHashes,
    sheetChosen: Boolean(sheetName),
  };
}

export const STATEMENT_ERROR_MESSAGES: Record<string, string> = {
  STATEMENT_BANK_REQUIRED: "اختر حسابًا بنكيًا نشطًا قبل قراءة الكشف.",
  STATEMENT_FILE_REQUIRED: "اختر ملف كشف الحساب.",
  STATEMENT_FILE_TOO_LARGE: "الحد الأقصى للملف 8 ميجابايت.",
  STATEMENT_TOO_LARGE:
    "الكشف أكبر من الحد المدعوم. قسّمه إلى ملفات حتى 5000 حركة.",
  STATEMENT_FILE_UNSUPPORTED: "الصيغ المدعومة XLSX وXLS وCSV وPDF.",
  STATEMENT_SHEET_REQUIRED: "اختر ورقة العمل ثم أعد المعاينة.",
  STATEMENT_SHEET_NOT_FOUND: "ورقة العمل غير موجودة. أعد اختيار الملف.",
  STATEMENT_CURRENCY_UNSUPPORTED:
    "توجد عملة غير مدعومة في الكشف. راجع الملف قبل الاستيراد.",
  STATEMENT_ACCOUNT_MISMATCH: "نهاية IBAN في الكشف لا تطابق الحساب المختار.",
  STATEMENT_PREVIOUS_CURRENCY_CONFLICT:
    "هذا الملف مسجل سابقًا بعملة مختلفة. يلزم مراجعة السجلات السابقة قبل إدخاله مجددًا.",
  STATEMENT_PREVIEW_REQUIRED:
    "أعد المعاينة وراجع بيانات الكشف قبل تأكيد الاستيراد.",
  STATEMENT_SELECTION_INVALID: "تعذّر قراءة اختيار الصفوف. أعد المعاينة.",
};
export function statementError(error: unknown) {
  const code =
    error instanceof StatementReviewError
      ? error.code
      : error instanceof Error && error.message.startsWith("STATEMENT_")
        ? error.message
        : "STATEMENT_FAILED";
  return {
    error:
      STATEMENT_ERROR_MESSAGES[code] ??
      "تعذّر إكمال قراءة الكشف أو حفظه. أعد التحقق من سجل الكشوف قبل المحاولة.",
    code,
  };
}
