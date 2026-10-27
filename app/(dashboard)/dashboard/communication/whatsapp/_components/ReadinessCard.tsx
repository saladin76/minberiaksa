"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw, Plug, FileCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { dt } from "@/lib/dashboard/i18n";
import { templateSyncTimestamps } from "@/lib/communication/template-sync-timestamps";
import { fmtDateTime } from "../../_shared/channel-ui";

export type WhatsappTemplateReadinessRow = {
  id: string; name: string; approvalStatus: string | null; category: string | null;
  language: string | null; registered: boolean; ready: boolean; state: string; updatedAt: string;
  /** Meta's answer per language  the readiness contract, not a local guess. */
  approvedLanguages: string[];
  approvedLocales: string[];
  rejectionReason: string | null;
  lastSyncedAt: string | null;
  latestSyncedAt?: string | null;
  oldestSyncedAt?: string | null;
};

export type WhatsappTemplateReadiness = { total: number; ready: number; rows: WhatsappTemplateReadinessRow[] };

const TEMPLATE_STATE_STYLE: Record<string, { label: string; className: string }> = {
  READY: { get label() { return dt("جاهز للإرسال"); }, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  PARTIAL: { get label() { return dt("جاهز على بعض الأرقام"); }, className: "border-amber-200 bg-amber-50 text-amber-700" },
  NOT_REGISTERED: { get label() { return dt("غير مسجّل لدى Meta"); }, className: "border-amber-200 bg-amber-50 text-amber-700" },
  PENDING: { get label() { return dt("بانتظار الموافقة"); }, className: "border-sky-200 bg-sky-50 text-sky-700" },
  REJECTED: { get label() { return dt("مرفوض"); }, className: "border-rose-200 bg-rose-50 text-rose-700" },
};

/**
 * Why the channel is or is not able to send.
 *
 * WhatsApp has two independent prerequisites  a configured Meta connection and at least one
 * Meta-approved template  and failing either produces the same symptom: nothing sends, silently.
 * Showing both side by side turns "why is this empty?" into a two-second read.
 */
export function ReadinessCard({ provider, templates, onSynced }: { provider: { configured: boolean; reason: string | null; missingFields: string[] }; templates: WhatsappTemplateReadiness; onSynced: () => void }) {
  const canSend = provider.configured && templates.ready > 0;
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [unmatchedNames, setUnmatchedNames] = useState<string[]>([]);
  const latest = templateSyncTimestamps(templates.rows.map((row) => row.latestSyncedAt ?? row.lastSyncedAt)).latestAt;
  const coverage = templateSyncTimestamps(templates.rows.map((row) => row.lastSyncedAt));
  const oldest = templateSyncTimestamps(templates.rows.map((row) => row.oldestSyncedAt ?? row.lastSyncedAt)).oldestAt;
  const formatSyncTime = (value: string) => {
    const formatted = fmtDateTime(value);
    return formatted ? `${formatted.date} · ${formatted.time}` : "";
  };

  const sync = async () => {
    setSyncing(true);
    setSyncNote(null);
    setUnmatchedNames([]);
    try {
      const res = await fetch("/api/dashboard/communication/whatsapp/templates/sync", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setSyncNote(dt("تعذّرت المزامنة: {0}", [body.error ?? dt("خطأ غير معروف")]));
        return;
      }
      const s = body.summary as { variantsUpserted: number; matchedTemplates: number; unmatchedNames: string[] };
      setUnmatchedNames(s.unmatchedNames);
      setSyncNote(
        dt("{0} نسخة لغوية عبر {1} قالبًا", [s.variantsUpserted, s.matchedTemplates]) +
        (s.unmatchedNames.length ? dt(" · {0} قالبًا لدى Meta بلا مقابل محلي", [s.unmatchedNames.length]) : ""),
      );
      onSynced();
    } catch {
      setSyncNote(dt("تعذّرت المزامنة: {0}", [dt("خطأ غير معروف")]));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-slate-900">{dt("جاهزية القناة")}</h2>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-bold",
            canSend ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700",
          )}
        >
          {canSend ? dt("يمكن الإرسال") : dt("لا يمكن الإرسال")}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
          <Plug className={cn("mt-0.5 h-4 w-4 shrink-0", provider.configured ? "text-emerald-600" : "text-amber-600")} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-800">{dt("اتصال Meta WhatsApp")}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              {provider.configured
                ? dt("مُعدّ بالكامل.")
                : dt("غير مكتمل{0}.", [provider.missingFields.length ? dt("  ناقص: {0}", [provider.missingFields.join(dt("، "))]) : ""])}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
          <FileCheck2 className={cn("mt-0.5 h-4 w-4 shrink-0", templates.ready > 0 ? "text-emerald-600" : "text-amber-600")} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-800">{dt("قوالب معتمدة من Meta")}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              {templates.ready > 0
                ? dt("{0} من {1} قالب جاهز للإرسال.", [templates.ready, templates.total])
                : dt("لا يوجد قالب معتمد ({0} قالب محفوظ). الرسائل التي تبدأ من المنصة تتطلّب قالبًا معتمدًا من Meta.", [templates.total])}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => void sync()}
          disabled={syncing || !provider.configured}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
          {dt("مزامنة القوالب من Meta")}</button>
        <span className="text-[10px] text-slate-500">
          {latest ? <time dateTime={latest}>{dt("آخر مزامنة {0}", [formatSyncTime(latest)])}</time> : dt("لم تُزامَن القوالب بعد  الجاهزية تُقرأ من Meta.")}
        </span>
      </div>
      {oldest && oldest !== latest && <p className="mt-1 text-[10px] text-slate-500"><time dateTime={oldest}>{dt("أقدم مزامنة محفوظة {0}", [formatSyncTime(oldest)])}</time></p>}
      {templates.total > 0 && !coverage.complete && <p className="mt-1 text-[10px] text-amber-700">{dt("لم تُزامَن بعض النسخ اللغوية بعد.")}</p>}
      {syncNote && <p role="status" className="mt-1 text-[11px] font-medium text-slate-600">{syncNote}</p>}
      {unmatchedNames.length > 0 && <details className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
        <summary className="cursor-pointer font-semibold">{dt("قوالب Meta غير المرتبطة محليًا")}</summary>
        <ul className="mt-2 space-y-1">{unmatchedNames.map((name) => <li key={name} dir="ltr" className="break-all">{name}</li>)}</ul>
      </details>}

      {templates.rows.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
          {templates.rows.map((t) => {
            const style = TEMPLATE_STATE_STYLE[t.state] ?? TEMPLATE_STATE_STYLE.PENDING;
            return (
              <div key={t.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium text-slate-700">{t.name}</span>
                  {/* Which languages can actually go out  the thing a per-template boolean hid. A
                      campaign in a language with no approved variant is skipped, so this is the list
                      the campaign builder is constrained by. */}
                  <span className="block text-[10px] text-slate-400">
                    {t.approvedLanguages.length
                      ? dt("لغات معتمدة: {0}", [t.approvedLanguages.join(", ")])
                      : t.rejectionReason
                        ? dt("سبب الرفض: {0}", [t.rejectionReason])
                        : dt("لا لغة معتمدة")}
                  </span>
                </span>
                <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", style.className)}>
                  {style.label}
                </span>
              </div>
            );
          })}
          <Link
            href="/dashboard/templates"
            className="mt-1 inline-block text-[11px] font-semibold text-brand hover:underline"
          >
            {dt("إدارة القوالب ←")}</Link>
        </div>
      )}
    </section>
  );
}
