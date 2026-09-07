"use client";

import * as React from "react";
import axios from "axios";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Loader2, Sparkles, Activity, TrendingUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WhatsappTemplatePreview,
  type PreviewButton,
  type PreviewHeader,
  type PreviewVariable,
} from "./WhatsappTemplatePreview";
import type { TemplateRecommendation } from "@/lib/messaging/whatsapp-template-recommendations";

interface PerformancePayload {
  template: {
    id: string;
    name: string;
    externalTemplateId: string | null;
    templateType: string | null;
    provider: string | null;
    language: string | null;
    category: string | null;
    approvalStatus: string | null;
  };
  performance: {
    sent: number;
    delivered: number;
    failed: number;
    clicked: number;
    donations: number;
    revenueUSD: number;
    clickToDonationRate: number;
    failureRate: number;
    revenuePerMessage: number;
  };
  bestCountry: { key: string; count: number } | null;
  bestLanguage: { key: string; count: number } | null;
  recommendations: TemplateRecommendation[];
}

interface TemplatePayload {
  id: string;
  name: string;
  body: string;
  header: PreviewHeader | null;
  footerText: string | null;
  buttons: PreviewButton[];
  variables: PreviewVariable[];
  language: string | null;
  category: string | null;
  approvalStatus: string | null;
  templateType: string | null;
  externalTemplateId: string | null;
  lastImportedAt: string | null;
}

interface Props {
  template: TemplatePayload | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0, numberingSystem: "latn" })}`;
}
function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

const REC_SEVERITY_CLASS: Record<TemplateRecommendation["severity"], string> = {
  positive: "bg-emerald-50 border-emerald-200 text-emerald-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  info: "bg-sky-50 border-sky-200 text-sky-800",
};

export function WhatsappTemplatePreviewDialog({ template, open, onOpenChange }: Props) {
  const [perf, setPerf] = React.useState<PerformancePayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !template) return;
    let cancelled = false;
    setPerf(null);
    setLoading(true);
    setError(null);
    axios
      .get<PerformancePayload>(`/api/templates/whatsapp/${template.id}/performance`)
      .then((r) => {
        if (!cancelled) setPerf(r.data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          (e?.response?.data?.error as string | undefined) ?? "تعذر تحميل الأداء"
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, template]);

  if (!template) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-[640px] overflow-y-auto" dir="rtl">
        <SheetHeader className="text-right">
          <SheetTitle>معاينة قالب واتساب</SheetTitle>
          <SheetDescription>
            معاينة كاملة + أداء + توصيات جودة لهذا القالب.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <WhatsappTemplatePreview
            name={template.name}
            body={template.body}
            header={template.header}
            footerText={template.footerText}
            buttons={template.buttons}
            variables={template.variables}
            language={template.language}
            category={template.category}
            approvalStatus={template.approvalStatus}
            templateType={template.templateType}
            externalTemplateId={template.externalTemplateId}
            lastImportedAt={template.lastImportedAt}
          />

          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-slate-500" />
              <h3 className="text-xs font-semibold text-slate-800">أداء القالب</h3>
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-slate-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> جاري التحميل…
              </div>
            ) : error ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                {error}
              </div>
            ) : perf ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <Stat label="مُرسل" value={String(perf.performance.sent)} />
                <Stat label="مُسلَّم" value={String(perf.performance.delivered)} />
                <Stat label="فشل" value={String(perf.performance.failed)} />
                <Stat
                  label="نسبة الفشل"
                  value={fmtPct(perf.performance.failureRate)}
                  tone={perf.performance.failureRate >= 0.2 ? "warn" : undefined}
                />
                <Stat label="تبرعات" value={String(perf.performance.donations)} />
                <Stat label="إيراد (USD)" value={fmtMoney(perf.performance.revenueUSD)} tone="positive" />
                <Stat
                  label="إيراد/رسالة"
                  value={fmtMoney(perf.performance.revenuePerMessage)}
                />
                <Stat
                  label="نقر→تبرع"
                  value={fmtPct(perf.performance.clickToDonationRate)}
                />
              </div>
            ) : null}
            {perf && (perf.bestCountry || perf.bestLanguage) ? (
              <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-600">
                {perf.bestCountry ? (
                  <span>
                    أفضل دولة:{" "}
                    <span className="font-medium text-slate-800">
                      {perf.bestCountry.key}
                    </span>{" "}
                    ({perf.bestCountry.count})
                  </span>
                ) : null}
                {perf.bestLanguage ? (
                  <span>
                    أفضل لغة:{" "}
                    <span className="font-medium text-slate-800">
                      {perf.bestLanguage.key}
                    </span>{" "}
                    ({perf.bestLanguage.count})
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {perf && perf.recommendations.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-violet-600" />
                <h3 className="text-xs font-semibold text-slate-800">توصيات</h3>
              </div>
              <ul className="space-y-2">
                {perf.recommendations.map((r) => (
                  <li
                    key={r.id}
                    className={cn(
                      "rounded-md border p-2 text-[11px]",
                      REC_SEVERITY_CLASS[r.severity]
                    )}
                  >
                    <div className="flex items-center gap-1.5 font-semibold mb-0.5">
                      {r.severity === "warning" ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : r.severity === "positive" ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : null}
                      {r.title}
                    </div>
                    <p className="leading-relaxed opacity-90">{r.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-md px-2 py-1.5 border",
        tone === "positive"
          ? "bg-emerald-50 border-emerald-200"
          : tone === "warn"
          ? "bg-amber-50 border-amber-200"
          : "bg-slate-50 border-slate-200"
      )}
    >
      <p className="text-[10px] text-slate-600">{label}</p>
      <p
        className={cn(
          "text-sm font-bold",
          tone === "positive" ? "text-emerald-700" : tone === "warn" ? "text-amber-800" : "text-slate-900"
        )}
        dir="ltr"
      >
        {value}
      </p>
    </div>
  );
}
