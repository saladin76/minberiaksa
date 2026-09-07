"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Languages,
  Loader2,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContentLocalizationPreviewDialog } from "./ContentLocalizationPreviewDialog";

const LOCALE_LABELS: Record<string, string> = {
  en: "الإنجليزية",
  fr: "الفرنسية",
  tr: "التركية",
  id: "الإندونيسية",
  pt: "البرتغالية",
  es: "الإسبانية",
  de: "الألمانية",
};

const LOCALE_SHORT: Record<string, string> = {
  en: "EN",
  fr: "FR",
  tr: "TR",
  id: "ID",
  pt: "PT",
  es: "ES",
  de: "DE",
};

const FIELD_LABELS: Record<string, string> = {
  title: "العنوان",
  name: "الاسم",
  description: "الوصف",
  content: "المحتوى",
  buttonText: "نص الزر",
};

const SECTION_LABELS = {
  campaigns: "المشاريع",
  categories: "الحملات",
  blog: "المقالات",
  slides: "الشرائح",
} as const;

type Section = keyof typeof SECTION_LABELS;

type LocaleSummary = {
  incompleteItems: number;
  missingRecords: number;
  emptyFields: number;
  identicalToArabicFields: number;
};

type LocaleStatus = {
  exists: boolean;
  complete: boolean;
  missingFields: string[];
  emptyFields: string[];
  identicalToArabicFields: string[];
};

type AuditItem = {
  id: string;
  label: string;
  typeLabel: string;
  arabicQualityIssues: Array<{
    field: string;
    rule: string;
    suggestion: string;
  }>;
  localeStatus: Record<string, LocaleStatus>;
};

type AuditResponse = {
  ok: boolean;
  section: Section;
  targetLocales: string[];
  generatedAt: string;
  summary: {
    totalItems: number;
    arabicQualityIssues: number;
    byLocale: Record<string, LocaleSummary>;
  };
  items: AuditItem[];
};

function fieldNames(fields: string[]): string {
  return fields.map((field) => FIELD_LABELS[field] || field).join("، ");
}

function issueText(locale: string, status: LocaleStatus): string {
  const reasons: string[] = [];
  if (!status.exists) reasons.push("الترجمة غير موجودة");
  if (status.emptyFields.length) {
    reasons.push(`حقول فارغة: ${fieldNames(status.emptyFields)}`);
  }
  if (status.missingFields.length) {
    reasons.push(`حقول ناقصة: ${fieldNames(status.missingFields)}`);
  }
  if (status.identicalToArabicFields.length) {
    reasons.push(`مطابق للعربية: ${fieldNames(status.identicalToArabicFields)}`);
  }
  return `${LOCALE_LABELS[locale] || locale}: ${reasons.join("، ")}`;
}

function completionPercent(total: number, incomplete: number): number {
  if (!total) return 100;
  return Math.max(0, Math.round(((total - incomplete) / total) * 100));
}

export function ContentLocalizationAuditCard({ section }: { section: Section }) {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAudit() {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get<AuditResponse>(
        "/api/admin/content-localization/audit",
        { params: { section, onlyIssues: true } },
      );
      setData(response.data);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || "تعذر فحص الترجمات الآن");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const totals = useMemo(() => {
    const localeSummaries = Object.values(data?.summary.byLocale || {});
    return {
      total: data?.summary.totalItems || 0,
      incomplete: localeSummaries.reduce(
        (sum, item) => sum + item.incompleteItems,
        0,
      ),
      missingRecords: localeSummaries.reduce(
        (sum, item) => sum + item.missingRecords,
        0,
      ),
      emptyFields: localeSummaries.reduce(
        (sum, item) => sum + item.emptyFields,
        0,
      ),
      identicalFields: localeSummaries.reduce(
        (sum, item) => sum + item.identicalToArabicFields,
        0,
      ),
      arabicIssues: data?.summary.arabicQualityIssues || 0,
    };
  }, [data]);

  const hasIssues = totals.incomplete > 0 || totals.arabicIssues > 0;
  const visibleItems = data?.items || [];

  return (
    <>
      <Card className="border-blue-100 bg-gradient-to-br from-white to-sky-50/40 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-blue-100 p-2 text-brand">
                <Languages className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg">مراجعة النصوص والترجمات</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  فحص قراءة فقط لقسم {SECTION_LABELS[section]} يكشف نقص الترجمات وملاحظات المحتوى.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDetailsOpen((value) => !value)}
              className="gap-2"
            >
              {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {detailsOpen ? "إخفاء اللوحة" : "فتح اللوحة"}
            </Button>
          </div>
        </CardHeader>

        {detailsOpen ? (
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadAudit}
                disabled={loading}
                className="gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                تحديث الفحص
              </Button>
              <Button
                size="sm"
                onClick={() => setPreviewOpen(true)}
                className="gap-2 bg-brand hover:bg-[#014f9c]"
              >
                <Sparkles className="h-4 w-4" />
                فتح المعاينة الآمنة
              </Button>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
              <strong>التعديل الجماعي المباشر متوقف مؤقتًا.</strong> المعاينة لا تحفظ أي نص، ولا يوجد Save أوApply حتى اكتمال مسار Preview → Review → Approve → Apply → Rollback.
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {!data && loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> جاري الفحص…
              </div>
            ) : null}

            {data ? (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <Metric
                    icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />}
                    label="إجمالي العناصر"
                    value={totals.total}
                  />
                  <Metric
                    icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
                    label="حالات ترجمة تحتاج عملًا"
                    value={totals.incomplete}
                  />
                  <Metric
                    icon={<SearchCheck className="h-4 w-4 text-purple-600" />}
                    label="ملاحظات جودة العربية"
                    value={totals.arabicIssues}
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <SmallMetric label="ترجمات غير موجودة" value={totals.missingRecords} />
                  <SmallMetric label="حقول فارغة" value={totals.emptyFields} />
                  <SmallMetric label="حقول مطابقة للعربية" value={totals.identicalFields} />
                </div>

                <div className={`rounded-xl border p-3 ${hasIssues ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                  <div className="flex items-start gap-2 text-sm">
                    {hasIssues ? <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" />}
                    <p>{hasIssues ? "يوجد محتوى يحتاج مراجعة أوترجمة." : "كل الترجمات مكتملة وفق الفحص الحالي."}</p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                  {data.targetLocales.map((locale) => {
                    const localeData = data.summary.byLocale[locale];
                    const percent = completionPercent(
                      data.summary.totalItems,
                      localeData?.incompleteItems || 0,
                    );
                    return (
                      <div key={locale} className="rounded-lg border bg-white p-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <strong>{LOCALE_LABELS[locale] || locale}</strong>
                          <span>{percent}%</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {localeData?.incompleteItems || 0} عنصر يحتاج مراجعة
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-xl border bg-white p-3">
                  <button
                    type="button"
                    onClick={() => setItemsOpen((value) => !value)}
                    className="flex w-full items-center justify-between text-right"
                  >
                    <span className="text-sm font-semibold">
                      العناصر التي تحتاج عملًا ({visibleItems.length})
                    </span>
                    {itemsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {itemsOpen ? (
                    <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
                      {visibleItems.length ? visibleItems.map((item) => {
                        const incompleteLocales = Object.entries(item.localeStatus)
                          .filter(([, status]) => !status.complete);
                        return (
                          <div key={`${item.typeLabel}-${item.id}`} className="rounded-lg border bg-slate-50 p-3 text-sm">
                            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{item.label}</p>
                                <p className="text-xs text-muted-foreground">{item.typeLabel}</p>
                              </div>
                              <div className="flex flex-wrap gap-1 lg:justify-end">
                                {incompleteLocales.map(([locale, status]) => (
                                  <span
                                    key={locale}
                                    className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700"
                                    title={issueText(locale, status)}
                                  >
                                    {LOCALE_SHORT[locale] || locale}: {!status.exists ? "غير موجود" : "غير مكتمل"}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {incompleteLocales.length ? (
                              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                {incompleteLocales.map(([locale, status]) => (
                                  <div key={locale}>• {issueText(locale, status)}</div>
                                ))}
                              </div>
                            ) : null}

                            {item.arabicQualityIssues.length ? (
                              <div className="mt-2 rounded-md bg-purple-50 px-2 py-1 text-xs text-purple-700">
                                <strong>ملاحظات جودة العربية:</strong>{" "}
                                {item.arabicQualityIssues.map((issue) => issue.suggestion).join("، ")}
                              </div>
                            ) : null}
                          </div>
                        );
                      }) : (
                        <p className="text-sm text-muted-foreground">لا توجد عناصر تحتاج عملًا في الفحص الحالي.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </CardContent>
        ) : null}
      </Card>

      <ContentLocalizationPreviewDialog
        section={section}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        defaultLocale="de"
        onSaved={loadAudit}
      />
    </>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">{icon}{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <strong>{value}</strong>
    </div>
  );
}
