"use client";
import { useMemo, useRef, useState } from "react";
import axios from "axios";
import { Check, FileSpreadsheet, FileUp, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dt } from "@/lib/dashboard/i18n";
import { bankOptionName } from "@/lib/dashboard/bank-option";
import { LOCALE_OPTIONS } from "@/lib/locales";
import type { ParsedBankStatement } from "@/lib/bank-transfers/statement-parser";
import type { StatementReview } from "@/lib/bank-transfers/statement-import";

type Bank = {
  id: string | null;
  code: string | null;
  accountName?: string | null;
  nameAr: string;
  nameEn: string | null;
  nameTr: string | null;
  ibanLast4: string | null;
  currency: string;
  isActive: boolean;
};
type Preview = Omit<ParsedBankStatement, "rows"> &
  StatementReview & {
    previewToken: string;
    fileName: string;
    rowCount: number;
  };
type Result = {
  state: string;
  importedCount: number;
  duplicateCount: number;
  failedCount: number;
  unknownCount: number;
  excludedCount: number;
  possibleDuplicateCount: number;
  invalidCount: number;
};
const money = (n: number, c: string) =>
  `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
const totals = (values: Record<string, number>) =>
  Object.entries(values)
    .map(([c, n]) => money(n, c))
    .join(" · ") || "—";
const selectClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100";
function labels() {
  return {
    NEW: dt("جديدة"),
    EXISTING: dt("موجودة سابقًا"),
    POSSIBLE_DUPLICATE: dt("تكرار محتمل"),
    AMBIGUOUS: dt("هوية متشابهة داخل الكشف"),
    INVALID: dt("بيانات ناقصة"),
    NOT_CREDIT: dt("غير واردة"),
    EXCLUDED: dt("مستبعدة من الإدخال"),
  };
}
function message(code: string) {
  const messages: Record<string, string> = {
    STATEMENT_ACCOUNT_MISMATCH: dt(
      "نهاية IBAN في الكشف لا تطابق الحساب المختار.",
    ),
    STATEMENT_PREVIOUS_CURRENCY_CONFLICT: dt(
      "هذا الملف مسجل سابقًا بعملة مختلفة. يلزم مراجعة السجلات السابقة قبل إدخاله مجددًا.",
    ),
    STATEMENT_SHEET_REQUIRED: dt("اختر ورقة العمل ثم أعد المعاينة."),
    STATEMENT_PREVIEW_REQUIRED: dt(
      "أعد المعاينة وراجع بيانات الكشف قبل تأكيد الاستيراد.",
    ),
    STATEMENT_TOO_LARGE: dt(
      "الكشف أكبر من الحد المدعوم. قسّمه إلى ملفات حتى 5000 حركة.",
    ),
    STATEMENT_CURRENCY_UNSUPPORTED: dt(
      "توجد عملة غير مدعومة في الكشف. راجع الملف قبل الاستيراد.",
    ),
    STATEMENT_BANK_REQUIRED: dt("اختر حسابًا بنكيًا نشطًا قبل قراءة الكشف."),
  };
  return (
    messages[code] ??
    dt(
      "تعذّر إكمال قراءة الكشف أو حفظه. أعد التحقق من سجل الكشوف قبل المحاولة.",
    )
  );
}
export default function StatementImporter({
  banks,
  onImported,
}: {
  banks: Bank[];
  onImported: () => void;
}) {
  const accounts = banks.filter((bank) => bank.isActive);
  const first = accounts.find((bank) => bankOptionName(bank));
  const [bankId, setBankId] = useState(first?.id ?? first?.code ?? "");
  const [currency, setCurrency] = useState(first?.currency ?? "TRY");
  const [locale, setLocale] = useState("ar");
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [page, setPage] = useState(1);
  const generation = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const states = labels();
  const rows = useMemo(
    () =>
      (preview?.rows ?? []).filter(
        (row) =>
          (stateFilter === "all" || row.importState === stateFilter) &&
          (!query ||
            [
              row.description,
              row.donorName,
              row.reference,
              String(row.amount),
            ].some((text) =>
              text?.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
            )),
      ),
    [preview, stateFilter, query],
  );
  const shown = rows.slice((page - 1) * 25, page * 25);
  function reset() {
    generation.current++;
    setPreview(null);
    setExcluded(new Set());
    setConfirmed(false);
    setError("");
    setResult(null);
    setDirty(false);
    setPage(1);
  }
  function data() {
    const form = new FormData();
    if (file) form.set("file", file);
    form.set("bankId", bankId);
    form.set("currency", currency);
    form.set("donorLocale", locale);
    form.set("sheetName", sheet);
    form.set("excludedRows", JSON.stringify([...excluded]));
    return form;
  }
  async function read() {
    if (!file || !bankId) return;
    const current = ++generation.current;
    setBusy("preview");
    setError("");
    setConfirmed(false);
    setResult(null);
    try {
      const response = await axios.post<Preview>(
        "/api/admin/bank-transfers/preview",
        data(),
      );
      if (generation.current !== current) return;
      setPreview(response.data);
      setDirty(false);
      setPage(1);
    } catch (e) {
      if (generation.current === current) {
        setPreview(null);
        setError(message(axios.isAxiosError(e) ? e.response?.data?.code : ""));
      }
    } finally {
      if (generation.current === current) setBusy(null);
    }
  }
  async function commit() {
    if (
      !preview ||
      !confirmed ||
      dirty ||
      preview.blockers.length ||
      !preview.counts.NEW
    )
      return;
    setBusy("import");
    setError("");
    try {
      const form = data();
      form.set("previewToken", preview.previewToken);
      form.set("reviewConfirmed", "true");
      const response = await axios.post<Result>(
        "/api/admin/bank-transfers/import",
        form,
      );
      setResult(response.data);
      setConfirmed(false);
      setPreview(null);
      onImported();
    } catch (e) {
      setConfirmed(false);
      setPreview(null);
      setError(message(axios.isAxiosError(e) ? e.response?.data?.code : ""));
      onImported();
    } finally {
      setBusy(null);
    }
  }
  const selected = accounts.find((bank) => (bank.id ?? bank.code) === bankId);
  return (
    <section
      className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      aria-label={dt("استيراد كشف حساب")}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-brand-50 p-3 text-brand">
            <FileSpreadsheet size={22} />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">
              {dt("استيراد كشف حساب")}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {dt("معاينة واضحة، ثم إدخال الوارد الجديد للمراجعة.")}
            </p>
          </div>
        </div>
        <ol className="flex flex-wrap gap-4 text-xs text-slate-500">
          {[dt("اختيار الملف"), dt("مراجعة الكشف"), dt("إدخال للمراجعة")].map(
            (text, index) => (
              <li key={text} className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full ${index === (result ? 2 : preview ? 1 : 0) ? "bg-brand text-white" : "bg-slate-100"}`}
                >
                  {index + 1}
                </span>
                {text}
              </li>
            ),
          )}
        </ol>
      </div>
      <div className="grid gap-6 p-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4">
          <label className="block space-y-2 text-xs font-medium text-slate-600">
            <span>{dt("البنك")}</span>
            <select
              aria-label={dt("البنك")}
              className={selectClass}
              value={bankId}
              disabled={Boolean(busy)}
              onChange={(e) => {
                reset();
                setSheet("");
                setBankId(e.target.value);
                const b = accounts.find(
                  (b) => (b.id ?? b.code) === e.target.value,
                );
                if (b) setCurrency(b.currency);
              }}
            >
              <option value="" disabled>
                {dt("اختر البنك")}
              </option>
              {accounts.map((bank) => (
                <option
                  key={bank.id ?? bank.code}
                  value={bank.id ?? bank.code ?? ""}
                  disabled={!bankOptionName(bank)}
                >
                  {bankOptionName(bank) ?? dt("بيانات ناقصة")}
                  {bank.ibanLast4 ? ` · …${bank.ibanLast4}` : ""}
                </option>
              ))}
            </select>
          </label>
          {selected?.accountName && (
            <p className="text-xs text-slate-500">{selected.accountName}</p>
          )}
          <label className="block space-y-2 text-xs font-medium text-slate-600">
            <span>{dt("عملة عند غيابها من الملف")}</span>
            <select
              aria-label={dt("عملة عند غيابها من الملف")}
              className={selectClass}
              value={currency}
              disabled={Boolean(busy)}
              onChange={(e) => {
                reset();
                setCurrency(e.target.value);
              }}
            >
              {["TRY", "USD", "EUR"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <p className="text-xs leading-5 text-slate-500">
            {dt(
              "العملة المكتوبة في الكشف لها الأولوية. لا يجري تحويل المبالغ بين العملات.",
            )}
          </p>
          <label className="block space-y-2 text-xs font-medium text-slate-600">
            <span>{dt("لغة المتبرعين")}</span>
            <select
              aria-label={dt("لغة المتبرعين")}
              className={selectClass}
              value={locale}
              disabled={Boolean(busy)}
              onChange={(e) => {
                reset();
                setLocale(e.target.value);
              }}
            >
              {LOCALE_OPTIONS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <FileUp className="mb-3 h-7 w-7 text-slate-400" />
            <label
              htmlFor="statement-file"
              className="block text-sm font-semibold"
            >
              {dt("اختر كشف الحساب")}
            </label>
            <p className="my-2 break-all text-xs text-slate-500">
              {file
                ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB`
                : "XLSX · XLS · CSV · PDF"}
            </p>
            <input
              ref={inputRef}
              id="statement-file"
              type="file"
              accept=".xlsx,.xls,.csv,.pdf"
              disabled={Boolean(busy)}
              className="sr-only"
              onChange={(e) => {
                reset();
                setSheet("");
                const next = e.target.files?.[0] ?? null;
                if (next && next.size > 8 * 1024 * 1024) {
                  setFile(null);
                  setError(dt("الحد الأقصى للملف 8 ميجابايت."));
                  e.target.value = "";
                } else setFile(next);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => inputRef.current?.click()}
            >
              {dt("اختيار الملف")}
            </Button>
            <p className="mt-3 text-[11px] text-slate-400">
              {dt("حتى 8 ميجابايت و5000 حركة في الورقة.")}
            </p>
          </div>
          {(preview?.sheets?.length ?? 0) > 1 && (
            <label className="block space-y-2 text-xs font-medium">
              <span>{dt("ورقة العمل")}</span>
              <select
                aria-label={dt("ورقة العمل")}
                value={sheet}
                disabled={Boolean(busy)}
                className={selectClass}
                onChange={(e) => {
                  setSheet(e.target.value);
                  setExcluded(new Set());
                  setDirty(true);
                  setConfirmed(false);
                }}
              >
                <option value="">{dt("اختر ورقة العمل")}</option>
                {preview?.sheets?.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          )}
          <Button
            className="w-full gap-2"
            disabled={!file || !bankId || Boolean(busy)}
            onClick={read}
          >
            {busy === "preview" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Search size={16} />
            )}{" "}
            {preview ? dt("إعادة المعاينة") : dt("معاينة")}
          </Button>
        </div>
        <div className="min-w-0">
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
            >
              {error}
            </p>
          )}
          {result && (
            <div
              role="status"
              className={`rounded-xl border p-5 ${result.state === "COMPLETED" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
            >
              <h3 className="font-semibold">
                {result.state === "COMPLETED"
                  ? dt("اكتمل إدخال الكشف للمراجعة")
                  : dt("يحتاج الإدخال إلى متابعة")}
              </h3>
              <p className="mt-2 text-sm">
                {dt(
                  "أُدخلت {0} حركة جديدة، وموجودة سابقًا {1}، واستُبعدت {2}.",
                  [
                    result.importedCount,
                    result.duplicateCount,
                    result.excludedCount,
                  ],
                )}
              </p>
              <p className="mt-2 text-xs">
                {dt(
                  "تكرار محتمل أو تشابه: {0}، بيانات ناقصة: {1}، تعذّر حفظها: {2}.",
                  [
                    result.possibleDuplicateCount,
                    result.invalidCount,
                    result.failedCount,
                  ],
                )}
              </p>
              {result.state !== "COMPLETED" && (
                <p className="mt-3 text-sm">
                  {dt("حركات لم تتأكد نتيجة حفظها: {0}.", [
                    result.unknownCount,
                  ])}{" "}
                  {dt(
                    "راجع سجل الكشوف والحركات المحفوظة قبل إعادة المحاولة. لم تُنشأ تبرعات تلقائيًا.",
                  )}
                </p>
              )}
            </div>
          )}
          {!preview && !result && (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-8 text-center">
              <FileSpreadsheet className="mb-4 h-12 w-12 text-slate-300" />
              <h3 className="font-semibold text-slate-700">
                {dt("راجع الأرقام قبل إدخالها")}
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                {dt(
                  "سيظهر الحساب والعملة والفترة والحركات هنا. الاستيراد يحفظ مرشحات للمراجعة ولا يعتمدها كتبرعات.",
                )}
              </p>
            </div>
          )}
          {preview && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="break-all text-sm font-semibold">
                  {preview.fileName}
                </p>
                <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                  <div>
                    <span className="text-slate-500">IBAN</span>
                    <p
                      dir="ltr"
                      className="mt-1 break-all font-mono text-start"
                    >
                      {preview.bankIban ?? dt("غير موجود في الملف")}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">{dt("الفترة")}</span>
                    <p dir="ltr" className="mt-1 text-start">
                      {preview.dateRange?.from ?? "—"} →{" "}
                      {preview.dateRange?.to ?? "—"}
                    </p>
                  </div>
                  <p>
                    {dt("ورقة العمل")}: {preview.sheetName ?? "—"} ·{" "}
                    {dt("صف العناوين")}: {preview.headerRowNumber ?? "—"}
                  </p>
                  <p>
                    {dt("عمود المبلغ: {0}", [
                      preview.amountColumn.header ?? dt("مستنتج"),
                    ])}
                  </p>
                </div>
              </div>
              {(!preview.bankIban || !selected?.ibanLast4) && (
                <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  {dt(
                    "لا يمكن مطابقة الحساب تلقائيًا لغياب IBAN أو نهايته المسجلة. تحقق من الحساب يدويًا قبل التأكيد.",
                  )}
                </p>
              )}
              {!preview.detectedCurrency && (
                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                  {dt(
                    "لم تُقرأ عملة من عنوان المبلغ. راجع عملة كل صف والعملة البديلة المختارة.",
                  )}
                </p>
              )}
              {preview.warning && (
                <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  {dt(preview.warning)}
                </p>
              )}
              {preview.blockers.map((code) => (
                <p
                  role="alert"
                  key={code}
                  className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800"
                >
                  {message(code)}
                </p>
              ))}
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {[
                  { label: dt("حركات الكشف"), value: preview.rowCount },
                  { label: dt("جديدة للمراجعة"), value: preview.counts.NEW },
                  {
                    label: dt("موجودة سابقًا"),
                    value: preview.counts.EXISTING,
                  },
                  {
                    label: dt("تحتاج فحصًا"),
                    value:
                      preview.counts.POSSIBLE_DUPLICATE +
                      preview.counts.AMBIGUOUS +
                      preview.counts.INVALID,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-slate-200 p-3"
                  >
                    <p className="text-[11px] text-slate-500">{item.label}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
                <p>
                  {dt("الوارد في الكشف")}:{" "}
                  <b dir="ltr">{totals(preview.incomingTotals)}</b>
                </p>
                <p>
                  {dt("الجديد المحدد للإدخال")}:{" "}
                  <b dir="ltr">{totals(preview.selectedTotals)}</b>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label={dt("بحث في المعاينة")}
                  placeholder={dt("بحث في المعاينة")}
                  value={query}
                  className="min-w-0 flex-1 basis-44"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                />
                <select
                  aria-label={dt("حالة الصف")}
                  className={`${selectClass} max-w-full sm:w-48`}
                  value={stateFilter}
                  onChange={(e) => {
                    setStateFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">{dt("كل الحركات")}</option>
                  {Object.entries(states).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div data-mobile-statement-rows className="space-y-3 md:hidden">
                {shown.map((row) => (
                  <article
                    key={row.rowKey}
                    className={`rounded-xl border border-slate-200 p-4 ${excluded.has(row.rowNumber) ? "bg-slate-50 opacity-70" : "bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          aria-label={dt("تضمين الصف {0}", [row.rowNumber])}
                          checked={
                            !excluded.has(row.rowNumber) &&
                            ["NEW", "AMBIGUOUS", "EXCLUDED"].includes(
                              row.importState,
                            )
                          }
                          disabled={
                            Boolean(busy) ||
                            !["NEW", "AMBIGUOUS", "EXCLUDED"].includes(
                              row.importState,
                            )
                          }
                          onChange={(event) => {
                            setExcluded((previous) => {
                              const next = new Set(previous);
                              if (event.target.checked)
                                next.delete(row.rowNumber);
                              else next.add(row.rowNumber);
                              return next;
                            });
                            setDirty(true);
                            setConfirmed(false);
                          }}
                        />
                        <span>#{row.rowNumber}</span>
                      </label>
                      <strong
                        dir="ltr"
                        className="text-base tabular-nums text-slate-900"
                      >
                        {row.amount === null
                          ? "—"
                          : `${row.direction === "DEBIT" ? "−" : ""}${money(row.amount, row.currency)}`}
                      </strong>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span
                        className={`rounded-full px-2 py-1 ${row.importState === "NEW" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        {states[row.importState]}
                      </span>
                      <time dir="ltr" className="text-slate-500">
                        {row.transactionAt?.replace("T", " ") ??
                          row.transactionDate ??
                          "—"}
                      </time>
                    </div>
                    <p className="mt-3 break-words text-sm leading-6 text-slate-700">
                      {row.description}
                    </p>
                    <p className="mt-2 break-all font-mono text-[10px] text-slate-400">
                      {[row.reference, row.channel]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                    {row.balance !== null && row.balance !== undefined && (
                      <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                        {dt("الرصيد")}:{" "}
                        <span dir="ltr" className="inline-block">
                          {money(row.balance, row.currency)}
                        </span>
                      </p>
                    )}
                  </article>
                ))}
                {!shown.length && (
                  <p className="p-6 text-center text-xs text-slate-400">
                    {dt("لا توجد عمليات مطابقة")}
                  </p>
                )}
              </div>
              <div className="hidden md:block max-h-[480px] overflow-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[850px] text-start text-xs">
                  <caption className="sr-only">
                    {dt("معاينة حركات الكشف")}
                  </caption>
                  <thead className="sticky top-0 bg-slate-100 text-slate-600">
                    <tr>
                      {[
                        dt("تضمين"),
                        "#",
                        dt("الحالة"),
                        dt("التاريخ والوقت"),
                        dt("الوصف والمرجع"),
                        dt("القيمة"),
                        dt("الرصيد"),
                      ].map((h) => (
                        <th key={h} className="p-3 text-start font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row) => (
                      <tr
                        key={row.rowKey}
                        className={`border-t border-slate-100 ${excluded.has(row.rowNumber) ? "bg-slate-50 text-slate-400" : ""}`}
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            aria-label={dt("تضمين الصف {0}", [row.rowNumber])}
                            checked={
                              !excluded.has(row.rowNumber) &&
                              ["NEW", "AMBIGUOUS", "EXCLUDED"].includes(
                                row.importState,
                              )
                            }
                            disabled={
                              Boolean(busy) ||
                              !["NEW", "AMBIGUOUS", "EXCLUDED"].includes(
                                row.importState,
                              )
                            }
                            onChange={(e) => {
                              setExcluded((previous) => {
                                const next = new Set(previous);
                                if (e.target.checked)
                                  next.delete(row.rowNumber);
                                else next.add(row.rowNumber);
                                return next;
                              });
                              setDirty(true);
                              setConfirmed(false);
                            }}
                          />
                        </td>
                        <td className="p-3 text-slate-400">{row.rowNumber}</td>
                        <td className="p-3">
                          <span
                            className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] ${row.importState === "NEW" ? "bg-emerald-50 text-emerald-700" : ["POSSIBLE_DUPLICATE", "AMBIGUOUS", "INVALID"].includes(row.importState) ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-500"}`}
                          >
                            {states[row.importState]}
                          </span>
                        </td>
                        <td className="whitespace-nowrap p-3" dir="ltr">
                          {row.transactionAt?.replace("T", " ") ??
                            row.transactionDate ??
                            "—"}
                        </td>
                        <td className="max-w-sm p-3">
                          <p className="line-clamp-2" title={row.description}>
                            {row.description}
                          </p>
                          <p className="mt-1 font-mono text-[10px] text-slate-400">
                            {[row.reference, row.channel]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </p>
                        </td>
                        <td
                          className="whitespace-nowrap p-3 font-semibold"
                          dir="ltr"
                        >
                          {row.amount === null
                            ? "—"
                            : `${row.direction === "DEBIT" ? "−" : ""}${money(row.amount, row.currency)}`}
                        </td>
                        <td
                          className="whitespace-nowrap p-3 text-slate-500"
                          dir="ltr"
                        >
                          {row.balance === null || row.balance === undefined
                            ? "—"
                            : money(row.balance, row.currency)}
                        </td>
                      </tr>
                    ))}
                    {!shown.length && (
                      <tr>
                        <td
                          colSpan={7}
                          className="p-8 text-center text-slate-400"
                        >
                          {dt("لا توجد عمليات مطابقة")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  {dt("صفحة {0} من {1}", [
                    page,
                    Math.max(1, Math.ceil(rows.length / 25)),
                  ])}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    {dt("السابق")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page * 25 >= rows.length}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {dt("التالي")}
                  </Button>
                </div>
              </div>
              <p className="text-xs leading-5 text-slate-500">
                {dt(
                  "الرصيد للمراجعة فقط. الحركات غير الواردة والموجودة سابقًا والمشتبه بها لا تُدخل. لا يُستنتج الخصم من اختلاف الأرصدة.",
                )}
              </p>
              {dirty && (
                <p
                  role="status"
                  className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800"
                >
                  {dt(
                    "تغيّر اختيار الصفوف أو الورقة. أعد المعاينة لتحديث الأرقام قبل التأكيد.",
                  )}
                </p>
              )}
              <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
                <label className="flex items-start gap-3 text-sm leading-6">
                  <input
                    type="checkbox"
                    className="mt-1.5"
                    checked={confirmed}
                    disabled={
                      dirty ||
                      Boolean(busy) ||
                      preview.blockers.length > 0 ||
                      !preview.counts.NEW
                    }
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    {dt(
                      "راجعت الحساب والعملة والتواريخ والمبالغ، وأريد إدخال الحركات الجديدة للمراجعة.",
                    )}
                  </span>
                </label>
                <Button
                  className="mt-4 gap-2"
                  disabled={
                    !confirmed ||
                    dirty ||
                    Boolean(busy) ||
                    preview.blockers.length > 0 ||
                    !preview.counts.NEW
                  }
                  onClick={commit}
                >
                  {busy === "import" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Check size={16} />
                  )}{" "}
                  {dt("إدخال {0} حركة للمراجعة", [preview.counts.NEW])}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
