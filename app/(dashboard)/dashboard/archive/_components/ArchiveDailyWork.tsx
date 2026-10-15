import Link from "next/link";
import type { ReactNode } from "react";
import { Clock, Tags, Megaphone, ShieldAlert, FileText, Image as ImageIcon, Video, File as FileIcon } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import type { ArchiveAsset, ArchiveProject, ArchiveSnapshot } from "@/lib/archive/archive-types";
import { ArchiveAssetUseInContent } from "./ArchiveAssetUseInContent";
import { dashIntl, dt, dtx } from "@/lib/dashboard/i18n";

export type ArchiveWorkKey = "latest" | "classify" | "marketing" | "rights";

const WORK_LABELS: Record<ArchiveWorkKey, { label: string; caption: string; icon: typeof Clock; tone: string }> = {
  latest: { get label() { return dt("أحدث الملفات"); }, get caption() { return dt("آخر ما أُضيف للأرشيف"); }, icon: Clock, tone: "text-slate-600" },
  classify: { get label() { return dt("ملفات تحتاج تصنيف"); }, get caption() { return dt("بانتظار المراجعة والتصنيف"); }, icon: Tags, tone: "text-amber-600" },
  marketing: { get label() { return dt("ملفات جاهزة للتسويق"); }, get caption() { return dt("معتمدة وقابلة للاستخدام"); }, icon: Megaphone, tone: "text-emerald-600" },
  rights: { get label() { return dt("بدون حقوق استخدام واضحة"); }, get caption() { return dt("تحتاج مراجعة الخصوصية والحقوق"); }, icon: ShieldAlert, tone: "text-rose-600" },
};

const WORK_ORDER: ArchiveWorkKey[] = ["latest", "classify", "marketing", "rights"];

function isClassify(a: ArchiveAsset) {
  return a.humanReviewStatus === "PENDING";
}
function isMarketing(a: ArchiveAsset) {
  return a.marketingApproved;
}
function isUnclearRights(a: ArchiveAsset) {
  return a.isSensitive || a.needsBlur || a.recommendedUse === "DO_NOT_USE";
}
function assetTime(a: ArchiveAsset) {
  return a.modifiedTime || a.createdTime || "";
}

function bucketAssets(assets: ArchiveAsset[], work: ArchiveWorkKey): ArchiveAsset[] {
  const sorted = [...assets].sort((a, b) => assetTime(b).localeCompare(assetTime(a)));
  if (work === "classify") return sorted.filter(isClassify);
  if (work === "marketing") return sorted.filter(isMarketing);
  if (work === "rights") return sorted.filter(isUnclearRights);
  return sorted;
}

function usageBadge(a: ArchiveAsset): { label: string; cls: string } {
  if (a.recommendedUse === "DO_NOT_USE") return { label: dt("غير قابلة للاستخدام"), cls: "border-rose-200 bg-rose-50 text-rose-700" };
  if (a.isSensitive || a.needsBlur) return { label: dt("حقوق غير واضحة"), cls: "border-rose-200 bg-rose-50 text-rose-700" };
  if (a.marketingApproved) return { label: dt("جاهزة للتسويق"), cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (a.humanReviewStatus === "DOCUMENTATION_ONLY" || a.documentationApproved) return { label: dt("للتوثيق فقط"), cls: "border-slate-200 bg-slate-100 text-slate-600" };
  if (a.humanReviewStatus === "PENDING") return { label: dt("تحتاج تصنيف"), cls: "border-amber-200 bg-amber-50 text-amber-700" };
  if (a.humanReviewStatus === "REJECTED") return { label: dt("مرفوضة"), cls: "border-rose-200 bg-rose-50 text-rose-700" };
  return { label: dt("قيد المراجعة"), cls: "border-slate-200 bg-slate-50 text-slate-600" };
}

const TYPE_LABEL: Record<ArchiveAsset["fileType"], string> = { get IMAGE() { return dt("صورة"); }, get VIDEO() { return dt("فيديو"); }, get DOCUMENT() { return dt("مستند"); }, get FOLDER() { return dt("مجلد"); }, get OTHER() { return dt("ملف"); } };
function TypeIcon({ type }: { type: ArchiveAsset["fileType"] }) {
  if (type === "IMAGE") return <ImageIcon className="h-4 w-4 text-slate-400" />;
  if (type === "VIDEO") return <Video className="h-4 w-4 text-slate-400" />;
  if (type === "DOCUMENT") return <FileText className="h-4 w-4 text-slate-400" />;
  return <FileIcon className="h-4 w-4 text-slate-400" />;
}

function href(work: ArchiveWorkKey) {
  return work === "latest" ? "/dashboard/archive" : `/dashboard/archive?work=${work}`;
}

export function ArchiveDailyWork({ snapshot, work = "latest" }: { snapshot: ArchiveSnapshot; work?: ArchiveWorkKey }) {
  const projectById = new Map<string, ArchiveProject>(snapshot.projects.map((p) => [p.id, p]));
  const assets = snapshot.assets;
  const counts: Record<ArchiveWorkKey, number> = {
    latest: assets.length,
    classify: assets.filter(isClassify).length,
    marketing: assets.filter(isMarketing).length,
    rights: assets.filter(isUnclearRights).length,
  };
  const active = bucketAssets(assets, work).slice(0, 12);
  const activeMeta = WORK_LABELS[work];

  return (
    <section className="space-y-4">
      {/* Max 4 work cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {WORK_ORDER.map((key) => {
          const meta = WORK_LABELS[key];
          const Icon = meta.icon;
          const isActive = key === work;
          return (
            <Link
              key={key}
              href={href(key)}
              className={`rounded-xl border bg-white p-4 shadow-sm transition hover:border-brand/50 ${isActive ? "border-brand ring-1 ring-brand/30" : "border-slate-200"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-bold text-slate-500`}>{meta.label}</span>
                <Icon className={`h-4 w-4 ${meta.tone}`} />
              </div>
              <p className="mt-2 text-2xl font-black text-slate-950">{counts[key].toLocaleString(dashIntl("ar"))}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{meta.caption}</p>
            </Link>
          );
        })}
      </div>

      {/* Asset list for the active bucket */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-base font-black text-slate-950">{activeMeta.label}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{activeMeta.caption}</p>
          </div>
          <Link href="/dashboard/archive/marketing-picks" className="text-xs font-bold text-brand hover:underline">{dt("مختارات التسويق")}</Link>
        </div>

        {active.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={FileText}
            title={dt("لا توجد ملفات في هذه القائمة بعد")}
            description={dt("ارفع ملفًا ليظهر ضمن عمل اليوم.")}
            action={
              // Was "/dashboard/archive/marketing-files", which next.config.ts redirects to
              // this same URL  one wasted hop. Points at the canonical destination now.
              <Link href="/dashboard/archive/assets?category=MARKETING" className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-xs font-bold text-white hover:bg-brand-dark">{dt("رفع ملف")}</Link>
            }
          />
        ) : (
          <ul className="divide-y">
            {active.map((asset) => {
              const project = projectById.get(asset.projectId);
              const badge = usageBadge(asset);
              const thumb = asset.previewUrl || asset.thumbnailLink;
              const canUse = !isUnclearRights(asset) && asset.recommendedUse !== "DO_NOT_USE";
              return (
                <li key={asset.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                  {/* Thumbnail */}
                  <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-slate-50">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <TypeIcon type={asset.fileType} />
                    )}
                  </div>

                  {/* Primary info  not overloaded */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold text-slate-900">{asset.fileName}</span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        <TypeIcon type={asset.fileType} /> {TYPE_LABEL[asset.fileType]}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      {project ? <span>{dt("المشروع: ")}<b className="font-semibold text-slate-700">{project.title}</b></span> : null}
                      {project?.country ? <span>{dt("الدولة: ")}<b className="font-semibold text-slate-700">{project.country}</b></span> : null}
                      {project?.theme ? <span>{dt("المحور/اللغة: ")}<b className="font-semibold text-slate-700">{project.theme}</b></span> : null}
                    </div>

                    {/* Advanced metadata hidden in details */}
                    <details className="mt-2 text-xs text-slate-500">
                      <summary className="cursor-pointer select-none font-semibold text-slate-500 hover:text-slate-700">{dt("تفاصيل إضافية")}</summary>
                      <div className="mt-2 grid gap-1.5 rounded-lg bg-slate-50 p-3">
                        {asset.aiSummary ? <p className="leading-6 text-slate-600">{asset.aiSummary}</p> : null}
                        {asset.aiWarnings ? <p className="leading-6 text-amber-700">{dtx("تنبيه: {0}", [asset.aiWarnings])}</p> : null}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          <span>{dtx("جودة: {0}", [asset.qualityScore])}</span>
                          <span>{dtx("وضوح: {0}", [asset.clarityScore])}</span>
                          <span>{dtx("تأثير: {0}", [asset.emotionScore])}</span>
                          {asset.tags.length ? <span>{dt("وسوم: ")}{asset.tags.join(dt("، "))}</span> : null}
                        </div>
                        {asset.webViewLink ? <a href={asset.webViewLink} target="_blank" rel="noreferrer" className="font-bold text-brand hover:underline">{dt("فتح الملف الأصلي")}</a> : null}
                      </div>
                    </details>
                  </div>

                  {/* Usage status + action */}
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-bold ${badge.cls}`}>{badge.label}</span>
                    {canUse ? (
                      <ArchiveAssetUseInContent assetId={asset.id} fileName={asset.fileName} />
                    ) : (
                      <span className="text-[11px] font-semibold text-slate-400">{dt("راجع الحقوق قبل الاستخدام")}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}

export function ArchivePrimaryCtas(): ReactNode {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/dashboard/archive/marketing-files" className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-4 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700">
        {dt("رفع ملف")}</Link>
      <Link href="/dashboard/archive?work=latest#new-collection" className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 transition hover:border-brand hover:text-brand">
        {dt("إنشاء مجموعة")}</Link>
    </div>
  );
}
