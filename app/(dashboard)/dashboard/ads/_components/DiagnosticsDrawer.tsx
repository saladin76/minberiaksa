"use client";

import * as React from "react";
import axios from "axios";
import {
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  Sparkles,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getCountryDisplayNameFromCode } from "@/lib/dashboard/country-display-name";
import type { AdPlatform } from "@/lib/attribution/detect-source";
import type {
  AttributionStatus,
  ReasonEntry,
} from "@/lib/tracking/tracking-event-contract";

interface AuditLogEntry {
  id: string;
  createdAt: string;
  action: string;
  actorRole: string;
  actorName: string | null;
  messageAr: string;
  messageEn: string | null;
}

export interface DonationDetail {
  donation: {
    id: string;
    paidAt: string | null;
    createdAt: string;
    status: string;
    amount: number;
    totalAmount: number;
    amountUSD: number;
    currency: string;
    locale: string | null;
    donorCountryCode: string | null;
    provider: string | null;
    paymentMethod: string | null;
    subscriptionId: string | null;
  };
  attribution: {
    platform: AdPlatform;
    platformLabel: string;
    status: AttributionStatus;
    statusLabel: string;
    confidence: number;
    reasons: ReasonEntry[];
    warnings: ReasonEntry[];
    unresolvedMacros: { field: string; value: string }[];
    campaignName: string | null;
    campaignId: string | null;
    adsetId: string | null;
    adId: string | null;
    placement: string | null;
  };
  utm: Record<string, string | null>;
  clickIds: Record<string, string | null>;
  ga4: Record<string, string | null>;
  trackingEvents: {
    metaBrowserDonate: boolean | null;
    metaCapiDonate: boolean | null;
    metaCapiDonateFailed: boolean | null;
    ga4Purchase: boolean | null;
    googleAdsConversion: boolean | null;
    tiktokEvent: boolean | null;
    xEvent: boolean | null;
    eventId: string | null;
  };
  auditLogs: AuditLogEntry[];
  diagnosis: {
    missing: string[];
    fixes: string[];
  };
}

interface Props {
  donationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_PILL: Record<AttributionStatus, string> = {
  verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
  strong: "bg-teal-50 text-teal-700 border-teal-200",
  likely_paid: "bg-lime-50 text-lime-700 border-lime-200",
  ga4_inferred: "bg-sky-50 text-sky-700 border-sky-200",
  utm_only: "bg-amber-50 text-amber-700 border-amber-200",
  organic: "bg-slate-50 text-slate-600 border-slate-200",
  direct: "bg-slate-50 text-slate-600 border-slate-200",
  tracking_issue: "bg-rose-50 text-rose-700 border-rose-200",
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    numberingSystem: "latn",
  })}`;
}

function fmtIstanbul(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function Section({
  title,
  children,
  icon: Icon,
  count,
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  count?: number;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <header className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
        {Icon ? <Icon className="w-4 h-4 text-slate-500" /> : null}
        <h3 className="text-xs font-semibold text-slate-800">{title}</h3>
        {count != null ? (
          <span className="text-[10px] rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-600 mr-auto">
            {count}
          </span>
        ) : null}
      </header>
      <div className="p-3 text-xs">{children}</div>
    </section>
  );
}

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 py-1 border-b border-slate-50 last:border-b-0">
      <span className="text-slate-500 min-w-[140px] shrink-0">{label}</span>
      <span className={cn("text-slate-800 break-all", mono && "font-mono text-[11px]")}>
        {value ?? <span className="text-slate-400">—</span>}
      </span>
    </div>
  );
}

function EventBadge({ ok, label }: { ok: boolean | null | undefined; label: string }) {
  if (ok == null)
    return (
      <span className="inline-flex items-center gap-1 text-slate-500">
        <Info className="w-3.5 h-3.5" /> {label}: غير معروف
      </span>
    );
  return ok ? (
    <span className="inline-flex items-center gap-1 text-emerald-700">
      <CheckCircle2 className="w-3.5 h-3.5" /> {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-rose-700">
      <XCircle className="w-3.5 h-3.5" /> {label}
    </span>
  );
}

export function DiagnosticsDrawer({ donationId, open, onOpenChange }: Props) {
  const [data, setData] = React.useState<DonationDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !donationId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    axios
      .get<DonationDetail>(`/api/admin/ads/donation-detail/${donationId}`)
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          (e?.response?.data?.error as string | undefined) ?? "تعذر تحميل تفاصيل التبرع"
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, donationId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-[640px] overflow-y-auto" dir="rtl">
        <SheetHeader className="text-right">
          <SheetTitle>تشخيص تبرع</SheetTitle>
          <SheetDescription>
            تحليل كامل لمصدر هذا التبرع — مفيد لاكتشاف ثغرات التتبع.
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> جاري تحميل التفاصيل…
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        {data && (
          <div className="mt-4 space-y-3">
            <Section title="ملخص الإسناد" icon={ShieldCheck}>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium",
                    STATUS_PILL[data.attribution.status]
                  )}
                >
                  {data.attribution.statusLabel}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px] font-medium",
                    data.attribution.confidence >= 80
                      ? "text-emerald-700"
                      : data.attribution.confidence >= 40
                      ? "text-amber-700"
                      : "text-rose-700"
                  )}
                >
                  ثقة {data.attribution.confidence}%
                </span>
                <span className="text-[11px] text-slate-500 mr-auto">
                  المنصة: {data.attribution.platformLabel}
                </span>
              </div>
            </Section>

            <Section title="بيانات التبرع">
              <KV label="معرف التبرع" value={data.donation.id} mono />
              <KV label="تاريخ الدفع" value={fmtIstanbul(data.donation.paidAt)} />
              <KV label="الحالة" value={data.donation.status} />
              <KV
                label="المبلغ المدفوع"
                value={
                  <span dir="ltr">
                    {fmtMoney(data.donation.totalAmount)} {data.donation.currency}
                  </span>
                }
              />
              <KV
                label="المبلغ بالدولار"
                value={<span dir="ltr">{fmtMoney(data.donation.amountUSD)}</span>}
              />
              <KV
                label="دولة المتبرع"
                value={
                  data.donation.donorCountryCode
                    ? `${
                        getCountryDisplayNameFromCode(
                          data.donation.donorCountryCode,
                          "ar"
                        ) ?? data.donation.donorCountryCode
                      } (${data.donation.donorCountryCode})`
                    : null
                }
              />
              <KV label="مزود الدفع" value={data.donation.provider} />
              <KV label="طريقة الدفع" value={data.donation.paymentMethod || '—'} />
              <KV
                label="اشتراك شهري"
                value={data.donation.subscriptionId ? "نعم" : "لا"}
              />
            </Section>

            <Section
              title="أسباب التتبع"
              icon={Info}
              count={data.attribution.reasons.length}
            >
              {data.attribution.reasons.length === 0 ? (
                <p className="text-slate-400">لا توجد أسباب مسجّلة.</p>
              ) : (
                <ul className="space-y-1">
                  {data.attribution.reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span
                        className={cn(
                          "inline-block w-1.5 h-1.5 mt-1.5 rounded-full shrink-0",
                          r.severity === "error"
                            ? "bg-rose-500"
                            : r.severity === "warning"
                            ? "bg-amber-400"
                            : "bg-emerald-500"
                        )}
                      />
                      <span className="text-slate-700 leading-relaxed">{r.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              title="تحذيرات"
              icon={AlertTriangle}
              count={data.attribution.warnings.length}
            >
              {data.attribution.warnings.length === 0 ? (
                <p className="text-emerald-700">
                  لا تحذيرات — التتبع نظيف.
                </p>
              ) : (
                <ul className="space-y-1">
                  {data.attribution.warnings.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-rose-700">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{r.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="UTM / إسناد الرابط">
              {Object.entries(data.utm).map(([k, v]) => (
                <KV key={k} label={k} value={v} mono />
              ))}
            </Section>

            <Section title="Click IDs">
              {Object.entries(data.clickIds).map(([k, v]) => (
                <KV key={k} label={k} value={v} mono />
              ))}
            </Section>

            <Section title="GA4 Enrichment">
              {Object.entries(data.ga4).map(([k, v]) => (
                <KV key={k} label={k} value={v} mono />
              ))}
            </Section>

            <Section title="أحداث التتبع المرسلة">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <EventBadge ok={data.trackingEvents.metaCapiDonate} label="Meta CAPI Donate" />
                <EventBadge
                  ok={!data.trackingEvents.metaCapiDonateFailed}
                  label="بدون DonateFailed"
                />
                <EventBadge
                  ok={data.trackingEvents.metaBrowserDonate}
                  label="Meta Browser Donate"
                />
                <EventBadge ok={data.trackingEvents.ga4Purchase} label="GA4 purchase" />
                <EventBadge
                  ok={data.trackingEvents.googleAdsConversion}
                  label="Google Ads Conversion"
                />
                <EventBadge ok={data.trackingEvents.tiktokEvent} label="TikTok Event" />
                <EventBadge ok={data.trackingEvents.xEvent} label="X Event" />
              </div>
              <div className="pt-2 mt-2 border-t border-slate-100">
                <KV label="event_id" value={data.trackingEvents.eventId} mono />
              </div>
            </Section>

            <Section
              title="سجل التدقيق المرتبط"
              count={data.auditLogs.length}
            >
              {data.auditLogs.length === 0 ? (
                <p className="text-slate-400">لا توجد سجلات تدقيق للتبرع.</p>
              ) : (
                <ul className="space-y-2">
                  {data.auditLogs.map((a) => (
                    <li key={a.id} className="border-b border-slate-50 last:border-b-0 pb-2 last:pb-0">
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span>{fmtIstanbul(a.createdAt)}</span>
                        <span>•</span>
                        <span>{a.action}</span>
                        <span>•</span>
                        <span>{a.actorName ?? a.actorRole}</span>
                      </div>
                      <p className="text-slate-700 mt-0.5">{a.messageAr}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="التشخيص + إصلاح مقترح" icon={Sparkles}>
              {data.diagnosis.missing.length === 0 ? (
                <p className="text-emerald-700">لا توجد بيانات ناقصة.</p>
              ) : (
                <>
                  <p className="text-slate-500 mb-1">البيانات الناقصة:</p>
                  <ul className="space-y-0.5 mb-2">
                    {data.diagnosis.missing.map((m, i) => (
                      <li key={i} className="text-slate-700">
                        • {m}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {data.diagnosis.fixes.length > 0 && (
                <>
                  <p className="text-slate-500 mb-1">إصلاحات مقترحة:</p>
                  <ul className="space-y-0.5">
                    {data.diagnosis.fixes.map((f, i) => (
                      <li key={i} className="text-emerald-700">
                        ✓ {f}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
