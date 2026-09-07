"use client";

import * as React from "react";
import axios from "axios";
import { Megaphone, Calendar, Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AdPlatform,
  DonationSourceStatus,
} from "@/lib/attribution/detect-source";

interface JourneyEntry {
  id: string;
  createdAt: string;
  paidAt: string | null;
  status: string;
  amountUSD: number;
  currency: string;
  type: "MONTHLY" | "ONE_TIME";
  campaign: string | null;
  platform: AdPlatform;
  platformLabel: string;
  sourceStatus: DonationSourceStatus;
  sourceStatusLabel: string;
  confidence: number;
  adCampaign: string | null;
  placement: string | null;
}

interface JourneyResponse {
  donorId: string;
  totalDonations: number;
  paidDonations: number;
  firstTouch: JourneyEntry | null;
  journey: JourneyEntry[];
}

const STATUS_PILL: Record<DonationSourceStatus, string> = {
  verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "utm-only": "bg-amber-50 text-amber-700 border-amber-200",
  "tracking-error": "bg-rose-50 text-rose-700 border-rose-200",
  organic: "bg-slate-50 text-slate-600 border-slate-200",
};

const STATUS_DOT: Record<DonationSourceStatus, string> = {
  verified: "bg-emerald-500",
  "utm-only": "bg-amber-400",
  "tracking-error": "bg-rose-500",
  organic: "bg-slate-300",
};

function formatIstanbulShort(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function StatusBadge({ entry }: { entry: JourneyEntry }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap",
        STATUS_PILL[entry.sourceStatus]
      )}
    >
      <span className={cn("inline-block w-1.5 h-1.5 rounded-full", STATUS_DOT[entry.sourceStatus])} aria-hidden />
      {entry.platformLabel}
    </span>
  );
}

export function DonorAttributionJourney({ donorId }: { donorId: string }) {
  const [data, setData] = React.useState<JourneyResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    axios
      .get<JourneyResponse>(`/api/admin/donors/${donorId}/attribution-journey`)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          (e?.response?.data?.error as string | undefined) ?? "تعذر تحميل رحلة المتبرع الإعلانية"
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [donorId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-center justify-center text-sm text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> جاري تحميل رحلة المتبرع الإعلانية…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!data || data.journey.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground text-center">
        لا توجد تبرعات سابقة لهذا المتبرع
      </div>
    );
  }

  const first = data.firstTouch;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-gradient-to-l from-brand/5 to-white p-4">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
          <Megaphone className="w-4 h-4" /> مصدر الاكتساب الأول
        </h3>
        {first ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <StatusBadge entry={first} />
            {first.adCampaign ? (
              <span className="text-slate-700">
                <span className="text-slate-400">الحملة: </span>
                {first.adCampaign}
              </span>
            ) : null}
            {first.placement ? (
              <span className="text-slate-700 inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {first.placement}
              </span>
            ) : null}
            <span className="text-slate-700 inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {formatIstanbulShort(first.paidAt ?? first.createdAt)}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">لم يُسجَّل أي إسناد إعلاني لهذا المتبرع.</p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4" /> رحلة المتبرع
          </h3>
          <span className="text-[11px] text-muted-foreground">
            {data.paidDonations} مدفوع من {data.totalDonations}
          </span>
        </div>
        <ol className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {data.journey.map((j, idx) => (
            <li
              key={j.id}
              className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-white transition-colors"
            >
              <span className="shrink-0 w-5 text-[11px] font-mono text-slate-400 text-center">
                {idx + 1}
              </span>
              <StatusBadge entry={j} />
              <span className="text-xs text-slate-600 truncate flex-1">
                {j.adCampaign ?? j.campaign ?? <span className="text-slate-400">بدون حملة</span>}
              </span>
              <span className="text-[11px] text-slate-500 whitespace-nowrap">
                {formatIstanbulShort(j.paidAt ?? j.createdAt)}
              </span>
              {j.type === "MONTHLY" ? (
                <span className="text-[10px] px-1.5 py-px rounded-full bg-brand/10 text-brand whitespace-nowrap">
                  شهري
                </span>
              ) : null}
              {j.status !== "PAID" ? (
                <span className="text-[10px] px-1.5 py-px rounded-full bg-rose-50 text-rose-600 whitespace-nowrap">
                  فشل
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
