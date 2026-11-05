"use client";

import * as React from "react";
import { Archive, Copy, Download, Edit3, Link2, Loader2, RefreshCw, RotateCcw, Save, Search, Trash2, X } from "lucide-react";
import { blockedTrackingMacros, hasTrackingMacros, splitTrackingUrl } from "@/lib/marketing/tracking-link-policy";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dashDir, dt, dtx } from "@/lib/dashboard/i18n";

type LinkStatus = "ACTIVE" | "ARCHIVED" | "DELETED" | "ALL";
type PerformanceFilter = "ALL" | "WITH_DONATIONS" | "WITHOUT_DONATIONS" | "STRONG_MATCH" | "WEAK_MATCH";
type RecommendationTone = "good" | "warning" | "danger" | "neutral";

type CampaignLinkPerformanceRow = {
  id: string;
  name: string;
  platform: string | null;
  channel: string | null;
  url: string | null;
  status?: "ACTIVE" | "ARCHIVED" | "DELETED";
  saveCount?: number;
  createdAt: string | null;
  updatedAt?: string | null;
  identifiers: { utmCampaign?: string | null; utmId?: string | null; campaignId?: string | null; adsetId?: string | null; adId?: string | null; targetCountry?: string | null };
  metadata?: { objective?: string | null; audienceSegment?: string | null; messageVariant?: string | null; internalNotes?: string | null };
  recommendation?: { tone: RecommendationTone; label: string; action: string };
  performance: { donations: number; revenue: number; averageDonation: number; matchQuality: { strong: number; medium: number; weak: number }; matchReasons: Record<string, number> };
  intelligence?: {
    missingIdentifiers: string[];
    conversionGaps: { matchedDonationsMissingConversions: number };
    actionQueue: Array<{ id: string; priority: "HIGH" | "MEDIUM" | "LOW"; title: string; description: string; action: string }>;
  };
};

type ApiResponse = { ok: boolean; status?: LinkStatus; range: { from: string; to: string; days: number; dateBasis: string }; links: CampaignLinkPerformanceRow[]; summary: { links: number; activeLinks?: number; archivedLinks?: number; deletedLinks?: number; linksWithDonations: number; donationsConsidered: number; revenueMatched: number; linksWithMissingConversions?: number; highPriorityActions?: number } };
type EditState = { id: string; name: string; platform: string; campaignId: string; adsetId: string; adId: string; utmCampaign: string; targetCountry: string; objective: string; internalNotes: string };

const PLATFORMS = ["META", "GOOGLE_ADS", "TIKTOK", "X", "EMAIL", "WHATSAPP", "SMS", "ORGANIC"];
const STATUS_TABS: { value: LinkStatus; label: string }[] = [{ value: "ACTIVE", get label() { return dt("نشطة"); } }, { value: "ARCHIVED", get label() { return dt("مؤرشفة"); } }, { value: "DELETED", get label() { return dt("محذوفة"); } }, { value: "ALL", get label() { return dt("الكل"); } }];

function money(value: number | null | undefined) { return typeof value === "number" && Number.isFinite(value) ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"; }
function firstIdentifier(row: CampaignLinkPerformanceRow) { return row.identifiers.campaignId || row.identifiers.utmCampaign || row.identifiers.utmId || row.identifiers.adId || "—"; }
function reasonsLabel(row: CampaignLinkPerformanceRow) { const entries = Object.entries(row.performance.matchReasons || {}).slice(0, 4); return entries.length ? entries.map(([key, count]) => `${key}: ${count}`).join(" · ") : "—"; }
function statusLabel(status?: string) { if (status === "ARCHIVED") return dt("مؤرشف"); if (status === "DELETED") return dt("محذوف"); return dt("نشط"); }
function statusClass(status?: string) { if (status === "ARCHIVED") return "border-amber-200 bg-amber-50 text-amber-700"; if (status === "DELETED") return "border-rose-200 bg-rose-50 text-rose-700"; return "border-emerald-200 bg-emerald-50 text-emerald-700"; }
function recommendationClass(tone?: RecommendationTone) { if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-800"; if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-800"; if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800"; return "border-slate-200 bg-slate-50 text-slate-700"; }
function priorityClass(priority?: string) { if (priority === "HIGH") return "border-rose-200 bg-rose-50 text-rose-800"; if (priority === "MEDIUM") return "border-amber-200 bg-amber-50 text-amber-800"; return "border-slate-200 bg-slate-50 text-slate-700"; }
function editFromRow(row: CampaignLinkPerformanceRow): EditState { return { id: row.id, name: row.name || "", platform: row.platform || "META", campaignId: row.identifiers.campaignId || "", adsetId: row.identifiers.adsetId || "", adId: row.identifiers.adId || "", utmCampaign: row.identifiers.utmCampaign || "", targetCountry: row.identifiers.targetCountry || "", objective: row.metadata?.objective || "donations", internalNotes: row.metadata?.internalNotes || "" }; }
function linkMatches(row: CampaignLinkPerformanceRow, query: string) { const q = query.trim().toLowerCase(); if (!q) return true; const text = [row.name, row.platform, row.channel, row.url, row.status, row.identifiers.campaignId, row.identifiers.adsetId, row.identifiers.adId, row.identifiers.utmCampaign, row.identifiers.targetCountry, row.metadata?.objective, row.metadata?.internalNotes, row.recommendation?.label, row.recommendation?.action].filter(Boolean).join(" ").toLowerCase(); return text.includes(q); }
function performanceMatches(row: CampaignLinkPerformanceRow, filter: PerformanceFilter) { if (filter === "WITH_DONATIONS") return row.performance.donations > 0; if (filter === "WITHOUT_DONATIONS") return row.performance.donations === 0; if (filter === "STRONG_MATCH") return row.performance.matchQuality.strong > 0; if (filter === "WEAK_MATCH") return row.performance.matchQuality.weak > 0 && row.performance.matchQuality.strong === 0; return true; }

export default function CampaignLinksPanel({ canExport = false }: { canExport?: boolean }) {
  const [template, setTemplate] = React.useState<ReturnType<typeof splitTrackingUrl>>(null);
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [days, setDays] = React.useState(7);
  const [platform, setPlatform] = React.useState("ALL");
  const [status, setStatus] = React.useState<LinkStatus>("ACTIVE");
  const [editing, setEditing] = React.useState<EditState | null>(null);
  const [search, setSearch] = React.useState("");
  const [performanceFilter, setPerformanceFilter] = React.useState<PerformanceFilter>("ALL");

  const load = React.useCallback(async () => { setLoading(true); try { const params = new URLSearchParams({ days: String(days), limit: "100", status }); if (platform !== "ALL") params.set("platform", platform); const res = await fetch(`/api/admin/marketing-intelligence/campaign-links/performance?${params.toString()}`, { cache: "no-store" }); const json = (await res.json().catch(() => null)) as ApiResponse | null; if (!res.ok || !json?.ok) throw new Error("failed"); setData(json); } catch { toast.error(dt("تعذر تحميل أداء روابط الحملات")); setData(null); } finally { setLoading(false); } }, [days, platform, status]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => { const refresh = () => { void load(); }; window.addEventListener("campaign-links:updated", refresh); return () => window.removeEventListener("campaign-links:updated", refresh); }, [load]);
  const visibleLinks = React.useMemo(() => (data?.links ?? []).filter((row) => linkMatches(row, search) && performanceMatches(row, performanceFilter)), [data?.links, search, performanceFilter]);

  function exportCsv() { const params = new URLSearchParams({ status }); if (platform !== "ALL") params.set("platform", platform); if (search.trim()) params.set("q", search.trim()); window.open(`/api/admin/marketing-intelligence/campaign-links/export?${params.toString()}`, "_blank"); }
  async function copyLink(url: string | null) { if (!url) return; if (blockedTrackingMacros(url).length) { toast.error(dt("هذا الرابط يحتوي متغيرات غير صالحة. أنشئ نسخة مصححة قبل استخدامه.")); return; } if (hasTrackingMacros(url)) { setTemplate(splitTrackingUrl(url)); return; } try { await navigator.clipboard.writeText(url); toast.success(dt("تم نسخ الرابط")); } catch { toast.error(dt("تعذر نسخ الرابط")); } }
  async function runAction(id: string, action: "ARCHIVE" | "DELETE" | "RESTORE") {
    if (action === "ARCHIVE" && !window.confirm(dt("سيتم أرشفة الرابط وإبقاؤه كسجل تاريخي. هل تريد المتابعة؟"))) return;
    if (action === "DELETE" && !window.confirm(dt("سيتم نقل الرابط إلى قسم Deleted بدون حذف بياناته فعليًا. هل تريد المتابعة؟"))) return;
    setActionId(id);
    try {
      const res = await fetch("/api/admin/marketing-intelligence/campaign-links", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      const json = await res.json().catch(() => null) as { ok?: boolean; matched?: number; error?: string } | null;
      if (!res.ok || !json?.ok || json.matched === 0) throw new Error(json?.error || "action failed");
      if (action === "ARCHIVE") toast.success(dt("تم الأرشفة"));
      else if (action === "RESTORE") toast.success(dt("تم الاستعادة"));
      else toast.success(dt("تم الحذف المنطقي"));
      await load();
    } catch {
      toast.error(dt("فشلت العملية"));
    } finally {
      setActionId(null);
    }
  }
  async function saveEdit() { if (!editing) return; setActionId(editing.id); try { const res = await fetch("/api/admin/marketing-intelligence/campaign-links", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, action: "UPDATE", name: editing.name, platform: editing.platform, channel: editing.platform, campaignId: editing.campaignId, adsetId: editing.platform === "GOOGLE_ADS" ? "" : editing.adsetId, adGroupId: editing.platform === "GOOGLE_ADS" ? editing.adsetId : "", adId: editing.adId, utmCampaign: editing.utmCampaign, targetCountry: editing.targetCountry, objective: editing.objective, internalNotes: editing.internalNotes }) }); const json = await res.json().catch(() => null) as { ok?: boolean; matched?: number; error?: string } | null; if (!res.ok || !json?.ok || json.matched === 0) throw new Error(json?.error || "update failed"); toast.success(dt("تم تحديث بيانات الرابط")); setEditing(null); await load(); } catch (error) { toast.error(error instanceof Error ? error.message : dt("تعذر تحديث الرابط")); } finally { setActionId(null); } }

  return <div className="space-y-5" dir={dashDir()}>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-900">{dt("الروابط المحفوظة والأداء")}</h2><p className="mt-1 text-sm text-slate-500">{dt("ابحث عن رابط وتابع التبرعات المرتبطة به.")}</p></div><div className="flex flex-wrap items-center gap-2"><select aria-label={dt("المنصة / القناة")} value={platform} onChange={(event) => setPlatform(event.target.value)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"><option value="META">Meta</option><option value="GOOGLE_ADS">Google Ads</option><option value="TIKTOK">TikTok</option><option value="X">X</option><option value="EMAIL">{dt("البريد الإلكتروني")}</option><option value="WHATSAPP">{dt("واتساب")}</option><option value="SMS">{dt("الرسائل النصية")}</option><option value="ORGANIC">{dt("مشاركة مباشرة")}</option><option value="ALL">{dt("كل المنصات")}</option></select><select aria-label={dt("الفترة الزمنية")} value={days} onChange={(event) => setDays(Number(event.target.value))} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"><option value={1}>{dt("اليوم")}</option><option value={7}>{dt("آخر 7 أيام")}</option><option value={14}>{dt("آخر 14 يوم")}</option><option value={30}>{dt("آخر 30 يوم")}</option><option value={60}>{dt("آخر 60 يوم")}</option><option value={90}>{dt("آخر 90 يوم")}</option></select><Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="h-4 w-4" />{dt("تحديث")}</Button>{canExport ? <Button variant="outline" onClick={exportCsv} className="gap-2"><Download className="h-4 w-4" />{dt("تصدير CSV")}</Button> : null}</div></div>
    <p className="text-xs leading-6 text-slate-500">{dt("الأرقام من التبرعات المسجلة في الموقع؛ لا تشمل زيارات أو إنفاق منصات الإعلان.")}</p>
    {template ? <Card><CardHeader><CardTitle className="flex items-center justify-between">{dt("إعدادات رابط الإعلان")}<Button type="button" variant="ghost" onClick={() => setTemplate(null)} aria-label={dt("إغلاق")}><X className="h-4 w-4" /></Button></CardTitle><CardDescription>{dt("انسخ كل قيمة إلى خانتها داخل منصة الإعلان.")}</CardDescription></CardHeader><CardContent className="grid gap-4"><SavedCopy label={dt("رابط الموقع Website URL")} value={template.destination} /><SavedCopy label={dt("معلمات التتبع URL Parameters")} value={template.parameters} /></CardContent></Card> : null}
    <div className="flex flex-wrap gap-2 rounded-xl border bg-white p-2">{STATUS_TABS.map((tab) => <button key={tab.value} type="button" onClick={() => setStatus(tab.value)} aria-pressed={status === tab.value} className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition ${status === tab.value ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"}`}>{tab.label}</button>)}</div>
    <Card><CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_auto]"><div className="relative"><Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label={dt("بحث في الروابط")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={dt("ابحث باسم الرابط، المنصة، Campaign ID، التوصية، أو الإجراء المقترح...")} className="w-full rounded-md border bg-white py-2 pe-3 ps-9 text-sm" /></div><select aria-label={dt("فلتر الأداء")} value={performanceFilter} onChange={(event) => setPerformanceFilter(event.target.value as PerformanceFilter)} className="rounded-md border bg-white px-3 py-2 text-sm"><option value="ALL">{dt("كل الأداء")}</option><option value="WITH_DONATIONS">{dt("جلبت تبرعات")}</option><option value="WITHOUT_DONATIONS">{dt("بدون تبرعات")}</option><option value="STRONG_MATCH">{dt("مطابقة قوية")}</option><option value="WEAK_MATCH">{dt("مطابقة ضعيفة فقط")}</option></select></CardContent></Card>
    {editing ? <Card className="border-blue-200 bg-blue-50/40"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{dt("تعديل بيانات الرابط")}</CardTitle><CardDescription>{dt("التعديل لا يغير URL نفسه، لكنه يحسن التصنيف والمطابقة والتقارير.")}</CardDescription></div><Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button></div></CardHeader><CardContent className="grid gap-3 md:grid-cols-3"><EditField label={dt("اسم الرابط")} value={editing.name} onChange={(value) => setEditing({ ...editing, name: value })} /><div className="space-y-1"><label className="text-xs text-slate-500">{dt("المنصة")}</label><select value={editing.platform} onChange={(event) => setEditing({ ...editing, platform: event.target.value })} className="w-full rounded-md border bg-white px-3 py-2 text-sm">{PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div><EditField label="Campaign ID" value={editing.campaignId} onChange={(value) => setEditing({ ...editing, campaignId: value })} dir="ltr" /><EditField label="Ad Set / Ad Group ID" value={editing.adsetId} onChange={(value) => setEditing({ ...editing, adsetId: value })} dir="ltr" /><EditField label="Ad ID" value={editing.adId} onChange={(value) => setEditing({ ...editing, adId: value })} dir="ltr" /><EditField label="UTM Campaign" value={editing.utmCampaign} onChange={(value) => setEditing({ ...editing, utmCampaign: value })} dir="ltr" /><EditField label="Target Country" value={editing.targetCountry} onChange={(value) => setEditing({ ...editing, targetCountry: value.toUpperCase() })} dir="ltr" /><EditField label="Objective" value={editing.objective} onChange={(value) => setEditing({ ...editing, objective: value })} /><EditField label={dt("ملاحظات داخلية")} value={editing.internalNotes} onChange={(value) => setEditing({ ...editing, internalNotes: value })} /><div className="md:col-span-3 flex flex-wrap gap-2"><Button type="button" onClick={saveEdit} disabled={actionId === editing.id} className="gap-2"><Save className="h-4 w-4" />{dt("حفظ التعديلات")}</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}>{dt("إلغاء")}</Button></div></CardContent></Card> : null}
    {loading ? <div className="flex min-h-[20rem] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div> : !data ? <Card><CardContent className="p-8 text-center text-slate-500">{dt("لا توجد بيانات متاحة.")}</CardContent></Card> : <><div className="grid gap-3 sm:grid-cols-3">
      {[{ label: dt("الروابط بعد الفلاتر"), value: visibleLinks.length }, { label: dt("روابط جلبت تبرعات"), value: visibleLinks.filter(row => row.performance.donations > 0).length }, { label: dt("روابط تحتاج مراجعة التتبع"), value: visibleLinks.filter(row => (row.intelligence?.missingIdentifiers.length || 0) > 0 || (row.intelligence?.conversionGaps.matchedDonationsMissingConversions || 0) > 0).length }].map(metric => <Card key={metric.label}><CardContent className="p-4"><p className="text-xs text-slate-500">{metric.label}</p><p className="mt-2 text-2xl font-bold">{metric.value}</p></CardContent></Card>)}
    </div><Card><CardHeader><CardTitle>{dt("روابط الحملات")}</CardTitle><CardDescription>{dtx("الفترة: {0}  {1}. التوصية توضّح الإجراء العملي التالي لكل رابط.", [data.range.from, data.range.to])}</CardDescription><p className="mt-1 text-xs leading-6 text-slate-500">{dt("الأرقام تخص كل رابط على حدة؛ قد تطابق العملية أكثر من رابط عند تشابه معرّفات التتبع.")}</p></CardHeader><CardContent><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[640px] text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{[dt("الرابط والحملة"), dt("الحالة"), dt("التبرعات"), dt("الإيراد"), dt("إجراءات")].map(label => <th key={label} scope="col" className="px-4 py-3 text-start">{label}</th>)}</tr></thead><tbody>
      {visibleLinks.length === 0 ? <tr><td colSpan={5}><EmptyState variant="inline" icon={Link2} title={dt("لا توجد روابط مطابقة")} description={dt("جرّب تغيير الفلاتر أو أنشئ رابطًا جديدًا.")} /></td></tr> : visibleLinks.map(row => <tr key={row.id} className="border-t align-top">
        <td className="max-w-md px-4 py-4"><div className="font-semibold text-slate-900">{row.name}</div><div className="mt-1 text-xs text-slate-500">{row.platform || "—"} · <bdi>{firstIdentifier(row)}</bdi></div>
          <details className="mt-2 text-xs"><summary className="cursor-pointer text-slate-500">{dt("تفاصيل التتبع والتوصية")}</summary><div className="mt-3 space-y-2 leading-6"><p dir="ltr" className="max-w-sm break-all text-left text-slate-500">{row.url}</p><p>{dtx("أسباب المطابقة: {0}", [reasonsLabel(row)])}</p><p>{dtx("قوي: {0} · متوسط: {1} · ضعيف: {2}", [row.performance.matchQuality.strong, row.performance.matchQuality.medium, row.performance.matchQuality.weak])}</p><div className={`rounded-lg border p-3 ${recommendationClass(row.recommendation?.tone)}`}><b>{row.recommendation?.label || dt("قيد المراقبة")}</b><p>{row.recommendation?.action || dt("راقب الأداء بعد وصول المزيد من البيانات.")}</p></div>{row.intelligence?.actionQueue?.[0] ? <p className={priorityClass(row.intelligence.actionQueue[0].priority)}>{row.intelligence.actionQueue[0].title}</p> : null}{row.metadata?.internalNotes ? <p>{row.metadata.internalNotes}</p> : null}</div></details>
        </td><td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusClass(row.status)}`}>{statusLabel(row.status)}</span></td><td className="px-4 py-4 font-bold">{row.performance.donations}</td><td className="whitespace-nowrap px-4 py-4 font-semibold" dir="ltr">{money(row.performance.revenue)}</td>
        <td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => copyLink(row.url)} className="min-h-10 gap-1"><Copy className="h-3.5 w-3.5" />{row.url && hasTrackingMacros(row.url) ? dt("إعدادات الإعلان") : dt("نسخ")}</Button><details className="relative"><summary className="cursor-pointer rounded-md border px-3 py-2.5 text-xs">{dt("المزيد")}</summary><div className="mt-2 grid gap-1"><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(editFromRow(row))}><Edit3 className="me-1 h-3.5 w-3.5" />{dt("تعديل")}</Button>{row.status !== "ARCHIVED" && row.status !== "DELETED" ? <Button type="button" size="sm" variant="ghost" disabled={actionId === row.id} onClick={() => runAction(row.id, "ARCHIVE")}><Archive className="me-1 h-3.5 w-3.5" />{dt("أرشفة")}</Button> : null}{row.status === "ARCHIVED" || row.status === "DELETED" ? <Button type="button" size="sm" variant="ghost" disabled={actionId === row.id} onClick={() => runAction(row.id, "RESTORE")}><RotateCcw className="me-1 h-3.5 w-3.5" />{dt("استعادة")}</Button> : null}{row.status !== "DELETED" ? <Button type="button" size="sm" variant="ghost" disabled={actionId === row.id} onClick={() => runAction(row.id, "DELETE")} className="text-rose-700"><Trash2 className="me-1 h-3.5 w-3.5" />{dt("حذف")}</Button> : null}</div></details></div></td>
      </tr>)}
    </tbody></table></div></CardContent></Card></>}
  </div>;
}

function EditField({ label, value, onChange, dir }: { label: string; value: string; onChange: (value: string) => void; dir?: "ltr" | "rtl" }) { const id = React.useId(); return <div className="space-y-1"><label htmlFor={id} className="text-xs text-slate-500">{label}</label><input id={id} value={value} onChange={(event) => onChange(event.target.value)} dir={dir || "rtl"} className="w-full rounded-md border bg-white px-3 py-2 text-sm" /></div>; }


function SavedCopy({ label, value }: { label: string; value: string }) {
  const id = React.useId();
  return <div className="space-y-2"><label htmlFor={id} className="text-sm font-semibold">{label}</label><div className="flex items-start gap-2"><textarea id={id} readOnly value={value} dir="ltr" onFocus={event => event.target.select()} className="min-h-20 w-full min-w-0 resize-y rounded-lg border bg-slate-50 p-3 font-mono text-xs leading-6" /><Button type="button" variant="outline" aria-label={dt("نسخ {0}", [label])} onClick={async () => { try { await navigator.clipboard.writeText(value); toast.success(dt("تم النسخ")); } catch { toast.error(dt("تعذر النسخ")); } }}><Copy className="h-4 w-4" /></Button></div></div>;
}
