import Link from "next/link";
import type { ReactNode } from "react";
import { Archive, CalendarDays, Database, FileText, FolderOpen, Image, Link2, Settings2, Video } from "lucide-react";
import type { ArchiveAsset, ArchiveCollection, ArchiveDriveLink, ArchiveProject, ArchiveSnapshot, ArchiveTabKey } from "@/lib/archive/archive-types";
import { ArchiveCollectionCreatePanel } from "./ArchiveCollectionCreatePanel";
import { ArchiveCollectionManageActions } from "./ArchiveCollectionManageActions";
import { ArchiveDriveLinkActions } from "./ArchiveDriveLinkActions";
import { ArchiveDriveLinkCreatePanel } from "./ArchiveDriveLinkCreatePanel";
import { ArchiveDriveLinkManageActions } from "./ArchiveDriveLinkManageActions";
import { ArchiveProjectCreatePanel } from "./ArchiveProjectCreatePanel";
import { ArchiveProjectManageActions } from "./ArchiveProjectManageActions";
import { ArchiveUploadCard } from "./ArchiveUploadCard";
import { ArchiveDailyWork, ArchivePrimaryCtas, type ArchiveWorkKey } from "./ArchiveDailyWork";

type Props = {
  activeTab?: ArchiveTabKey;
  snapshot: ArchiveSnapshot;
  work?: ArchiveWorkKey;
  selection?: {
    collectionId?: string;
    year?: number;
    projectId?: string;
  };
};

type ProjectBundle = {
  project: ArchiveProject;
  links: ArchiveDriveLink[];
  assets: ArchiveAsset[];
};

type YearBundle = {
  year: number;
  projects: ProjectBundle[];
};

type CollectionBundle = {
  collection: ArchiveCollection;
  years: YearBundle[];
};

export function ArchiveConsole({ snapshot, selection, work = "latest", activeTab = "overview" }: Props) {
  // `activeTab` was declared in Props but never destructured, so all seven archive routes
  // (overview/collections/projects/drive-links/assets/marketing-picks/reports/ai) rendered a
  // byte-identical console with no indication of where you were — and, because nothing
  // rendered ARCHIVE_TABS either, no way to move between them except by typing URLs.
  //
  // Deliberately NOT filtering sections by tab: the console renders every section
  // unconditionally today, and picking which section "belongs" to which tab would be inventing
  // product behaviour and could hide tools admins currently reach from any of these URLs.
  // Surfacing the tab bar makes the prop meaningful and the routes navigable without removing
  // anything.
  const explorer = buildExplorer(snapshot);
  const activeCollection = explorer.find((item) => item.collection.id === selection?.collectionId);
  const activeProject = selection?.projectId ? findProject(explorer, selection.projectId) : null;
  const selectedYear = activeProject?.year.year ?? selection?.year;
  const activeYear = activeProject?.year ?? getSelectedYear(activeCollection, selectedYear);

  return (
    <main className="min-h-screen bg-[#FFFDF8] p-4 text-slate-950 sm:p-6" dir="rtl">
      <Hero snapshot={snapshot} explorer={explorer} />
      <ArchiveTabBar activeTab={activeTab} tabs={snapshot.tabs} />
      <Breadcrumb collection={activeCollection?.collection} year={selectedYear} project={activeProject?.bundle.project} />

      {!activeCollection ? (
        <RootExplorer snapshot={snapshot} explorer={explorer} work={work} />
      ) : activeProject ? (
        <ProjectDetail bundle={activeProject.bundle} collections={snapshot.collections} projects={snapshot.projects} />
      ) : activeYear ? (
        <YearDetail collection={activeCollection.collection} year={activeYear} collections={snapshot.collections} />
      ) : (
        <CollectionDetail item={activeCollection} collections={snapshot.collections} />
      )}
    </main>
  );
}

function ArchiveTabBar({ activeTab, tabs }: { activeTab: ArchiveTabKey; tabs: ArchiveSnapshot["tabs"] }) {
  if (!tabs?.length) return null;
  return (
    <nav aria-label="أقسام الأرشيف" className="mt-3 flex flex-wrap gap-1.5">
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "inline-flex h-8 items-center rounded-md border border-brand bg-brand px-3 text-xs font-bold text-white"
                : "inline-flex h-8 items-center rounded-md border bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-brand hover:text-brand"
            }
          >
            {tab.title}
          </Link>
        );
      })}
    </nav>
  );
}

function Hero({ snapshot, explorer }: { snapshot: ArchiveSnapshot; explorer: CollectionBundle[] }) {
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">الأرشيف</h1>
          <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-600">
            تصفح المواد خطوة بخطوة: المجموعة، ثم السنة، ثم المشروع، ثم جدول المواد. رابط Google Drive يضاف داخل المشروع فقط.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ArchivePrimaryCtas />
            <Link href="/dashboard/archive/settings" className="inline-flex h-9 items-center gap-2 rounded-md border bg-white px-3 text-xs font-bold text-slate-800 transition hover:border-brand hover:text-brand">
              <Settings2 className="h-3.5 w-3.5" /> إعدادات الأرشيف
            </Link>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-4 lg:min-w-[520px]">
          <Metric icon={<FolderOpen />} label="المجموعات" value={snapshot.summary.collections} />
          <Metric icon={<CalendarDays />} label="السنوات" value={countYears(explorer)} />
          <Metric icon={<Archive />} label="المشاريع" value={snapshot.summary.projects} />
          <Metric icon={<Link2 />} label="الروابط" value={snapshot.summary.driveLinks} />
        </div>
      </div>
    </section>
  );
}

function RootExplorer({ snapshot, explorer, work }: { snapshot: ArchiveSnapshot; explorer: CollectionBundle[]; work: ArchiveWorkKey }) {
  return (
    <div className="mt-4 space-y-4">
      {snapshot.assets.length > 0 ? <ArchiveDailyWork snapshot={snapshot} work={work} /> : null}

      <section id="new-collection" className="grid gap-3 xl:grid-cols-3">
        <CompactPanel title="إضافة مجموعة" description="مجموعة رئيسية مثل غزة، القدس أو الوقف.">
          <ArchiveCollectionCreatePanel />
        </CompactPanel>
        <ArchiveUploadCard
          category="MARKETING"
          title="إضافة ملفات مشاريع تسويقية"
          description="رفع مباشر لملفات PDF أو Excel الخاصة بالتسويق."
          openHref="/dashboard/archive/marketing-files"
        />
        <ArchiveUploadCard
          category="DOCUMENTS"
          title="أرشفة المستندات"
          description="رفع مباشر للعقود، التراخيص، والملفات الرسمية."
          openHref="/dashboard/archive/documents"
        />
      </section>

      <Panel title="المجموعات" description="المجموعات المضافة داخل الأرشيف.">
        {explorer.length === 0 ? (
          <EmptyState title="لا توجد مجموعات بعد" text="أضف أول مجموعة للبدء في بناء الأرشيف." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {explorer.map((item) => <CollectionCard key={item.collection.id} item={item} />)}
          </div>
        )}
      </Panel>

      <Panel title="ملخص المواد" description="إجمالي المواد المفهرسة داخل المشاريع.">
        <div className="grid gap-2 sm:grid-cols-4">
          <SummaryCard icon={<Image />} title="صور" value={countAssets(snapshot.assets, "IMAGE")} />
          <SummaryCard icon={<Video />} title="فيديوهات" value={countAssets(snapshot.assets, "VIDEO")} />
          <SummaryCard icon={<FileText />} title="تقارير ومستندات" value={countAssets(snapshot.assets, "DOCUMENT")} />
          <SummaryCard icon={<Database />} title="مواد أخرى" value={countOtherAssets(snapshot.assets)} />
        </div>
      </Panel>
    </div>
  );
}

function CollectionDetail({ item, collections }: { item: CollectionBundle; collections: ArchiveCollection[] }) {
  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">مجموعة</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">{item.collection.name}</h2>
            {archiveText(item.collection.description) ? <p className="mt-2 text-xs leading-6 text-slate-600">{archiveText(item.collection.description)}</p> : null}
          </div>
          <ArchiveCollectionManageActions collection={item.collection} />
        </div>
      </section>

      <CompactPanel title="إضافة مشروع" description="أضف مشروعًا داخل هذه المجموعة وحدد السنة المناسبة له.">
        <ArchiveProjectCreatePanel collections={collections} />
      </CompactPanel>

      <Panel title="السنوات" description="اختر السنة التي تريد عرض مشاريعها.">
        <div className="grid gap-2 sm:grid-cols-4 xl:grid-cols-6">
          {yearOptions(item).map((year) => (
            <Link key={year} href={archiveHref({ collectionId: item.collection.id, year })} className="rounded-lg border bg-slate-50 p-3 text-center transition hover:border-brand hover:bg-white">
              <p className="text-[11px] font-bold text-slate-500">السنة</p>
              <p className="mt-1 text-xl font-black text-slate-950">{year}</p>
              <p className="mt-1 text-[11px] text-slate-500">{item.years.find((itemYear) => itemYear.year === year)?.projects.length ?? 0} مشروع</p>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function YearDetail({ collection, year, collections }: { collection: ArchiveCollection; year: YearBundle; collections: ArchiveCollection[] }) {
  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs font-bold text-slate-500">{collection.name}</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">{year.year}</h2>
        <p className="mt-2 text-xs text-slate-600">اختر المشروع الذي تريد فتح روابطه ومواده.</p>
      </section>

      <CompactPanel title="إضافة مشروع" description="أضف مشروعًا داخل نفس المجموعة والسنة.">
        <ArchiveProjectCreatePanel collections={collections} defaultYear={year.year} />
      </CompactPanel>

      <Panel title="المشاريع" description="مشاريع السنة المختارة.">
        <ProjectTable collection={collection} year={year} collections={collections} />
      </Panel>
    </div>
  );
}

function ProjectDetail({ bundle, collections, projects }: { bundle: ProjectBundle; collections: ArchiveCollection[]; projects: ArchiveProject[] }) {
  const { project, links, assets } = bundle;

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">مشروع</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">{project.title}</h2>
            <p className="mt-1 text-xs leading-6 text-slate-600">{projectMeta(project)}</p>
            {archiveText(project.description) ? <p className="mt-2 text-xs leading-6 text-slate-600">{archiveText(project.description)}</p> : null}
          </div>
          <ArchiveProjectManageActions project={project} collections={collections} />
        </div>
      </section>

      <CompactPanel title="إضافة رابط توثيق" description="ضع رابط Google Drive الخاص بهذا المشروع فقط.">
        <ArchiveDriveLinkCreatePanel projects={[project]} />
      </CompactPanel>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="روابط التوثيق" description="الروابط التي سيتم استخدامها في المزامنة والفهرسة.">
          {links.length === 0 ? (
            <EmptyState title="لا توجد روابط" text="أضف رابط Google Drive لهذا المشروع." compact />
          ) : (
            <div className="space-y-2">
              {links.map((link) => <DriveLinkCard key={link.id} link={link} projects={projects} />)}
            </div>
          )}
        </Panel>

        <Panel title="مستكشف المواد" description="تظهر المواد هنا بعد المزامنة والتحليل.">
          <MaterialSummary assets={assets} />
          <MaterialTable assets={assets} />
        </Panel>
      </section>
    </div>
  );
}

function ProjectTable({ collection, year, collections }: { collection: ArchiveCollection; year: YearBundle; collections: ArchiveCollection[] }) {
  if (year.projects.length === 0) {
    return <EmptyState title="لا توجد مشاريع" text="لم يتم إنشاء مشاريع في هذه السنة بعد. أضف أول مشروع من النموذج بالأعلى." compact />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="p-3 text-right">المشروع</th>
            <th className="p-3 text-right">المدينة</th>
            <th className="p-3 text-right">التصنيف</th>
            <th className="p-3 text-right">الروابط</th>
            <th className="p-3 text-right">المواد</th>
            <th className="p-3 text-right">الإجراءات</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {year.projects.map((bundle) => (
            <tr key={bundle.project.id} className="align-top">
              <td className="p-3">
                <p className="font-black text-slate-950">{bundle.project.title}</p>
                <p className="mt-1 text-xs text-slate-500">{archiveText(bundle.project.description) || "بدون وصف"}</p>
              </td>
              <td className="p-3 text-slate-700">{archiveText(bundle.project.city) || "-"}</td>
              <td className="p-3 text-slate-700">{archiveText(bundle.project.theme) || "-"}</td>
              <td className="p-3 font-bold text-slate-800">{bundle.links.length}</td>
              <td className="p-3 font-bold text-slate-800">{bundle.assets.length}</td>
              <td className="p-3">
                <div className="flex flex-wrap gap-2">
                  <Link href={archiveHref({ collectionId: collection.id, year: bundle.project.year, projectId: bundle.project.id })} className="inline-flex h-8 items-center rounded-md border bg-white px-3 text-xs font-bold text-slate-800 transition hover:border-brand hover:text-brand">فتح</Link>
                  <ArchiveProjectManageActions project={bundle.project} collections={collections} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CollectionCard({ item }: { item: CollectionBundle }) {
  const stats = collectionStats(item);
  const description = archiveText(item.collection.description);

  return (
    <article className="rounded-lg border bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold text-slate-500">مجموعة</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{item.collection.name}</h3>
        </div>
        <FolderOpen className="h-4 w-4 text-brand" />
      </div>
      {description ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{description}</p> : null}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <SmallCounter label="سنوات" value={item.years.length} />
        <SmallCounter label="مشاريع" value={stats.projects} />
        <SmallCounter label="روابط" value={stats.links} />
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] items-start gap-2">
        <Link href={archiveHref({ collectionId: item.collection.id })} className="inline-flex h-8 items-center justify-center rounded-md border bg-white px-3 text-xs font-bold text-slate-800 transition hover:border-brand hover:text-brand">فتح</Link>
        <ArchiveCollectionManageActions collection={item.collection} />
      </div>
    </article>
  );
}

function DriveLinkCard({ link, projects }: { link: ArchiveDriveLink; projects: ArchiveProject[] }) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-black text-slate-950">{archiveText(link.title) || "رابط توثيق"}</p>
          <p dir="ltr" className="mt-1 truncate text-xs text-slate-500">{cleanDriveUrl(link.driveUrl)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{driveLinkTypeLabel(link.linkType)}</Badge>
            <Badge>{link.totalFiles} ملف</Badge>
            <Badge>{link.totalImages} صورة</Badge>
            <Badge>{link.totalVideos} فيديو</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ArchiveDriveLinkActions linkId={link.id} />
          <ArchiveDriveLinkManageActions link={link} projects={projects} />
        </div>
      </div>
    </div>
  );
}

function MaterialSummary({ assets }: { assets: ArchiveAsset[] }) {
  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-4">
      <SmallCounter label="صور" value={countAssets(assets, "IMAGE")} />
      <SmallCounter label="فيديو" value={countAssets(assets, "VIDEO")} />
      <SmallCounter label="تقارير" value={countAssets(assets, "DOCUMENT")} />
      <SmallCounter label="أخرى" value={countOtherAssets(assets)} />
    </div>
  );
}

function MaterialTable({ assets }: { assets: ArchiveAsset[] }) {
  if (assets.length === 0) {
    return <p className="rounded-lg border border-dashed bg-white p-4 text-sm text-slate-600">ستظهر المواد هنا بعد مزامنة رابط التوثيق.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="p-3 text-right">النوع</th>
            <th className="p-3 text-right">الاسم</th>
            <th className="p-3 text-right">الرابط</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {assets.slice(0, 12).map((asset) => (
            <tr key={asset.id}>
              <td className="p-3 font-bold text-slate-700">{fileTypeLabel(asset.fileType)}</td>
              <td className="p-3 text-slate-700">{archiveText(asset.fileName) || asset.fileName}</td>
              <td className="p-3">
                {asset.webViewLink ? (
                  <a className="font-bold text-brand hover:underline" href={asset.webViewLink} target="_blank" rel="noreferrer">عرض</a>
                ) : (
                  <span className="text-slate-400">غير متاح</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {assets.length > 12 ? <p className="border-t bg-slate-50 p-3 text-xs text-slate-500">يعرض أول 12 مادة فقط.</p> : null}
    </div>
  );
}

function Breadcrumb({ collection, year, project }: { collection?: ArchiveCollection; year?: number; project?: ArchiveProject }) {
  if (!collection && !year && !project) return null;
  return (
    <nav className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
      <Link href="/dashboard/archive" className="rounded-md border bg-white px-3 py-1.5 hover:border-brand">الأرشيف</Link>
      {collection ? <Link href={archiveHref({ collectionId: collection.id })} className="rounded-md border bg-white px-3 py-1.5 hover:border-brand">{collection.name}</Link> : null}
      {collection && year ? <Link href={archiveHref({ collectionId: collection.id, year })} className="rounded-md border bg-white px-3 py-1.5 hover:border-brand">{year}</Link> : null}
      {collection && year && project ? <span className="rounded-md bg-slate-900 px-3 py-1.5 text-white">{project.title}</span> : null}
    </nav>
  );
}

function buildExplorer(snapshot: ArchiveSnapshot): CollectionBundle[] {
  const linksByProject = new Map<string, ArchiveDriveLink[]>();
  snapshot.driveLinks.forEach((link) => {
    const list = linksByProject.get(link.projectId) ?? [];
    list.push(link);
    linksByProject.set(link.projectId, list);
  });

  const assetsByProject = new Map<string, ArchiveAsset[]>();
  snapshot.assets.forEach((asset) => {
    const list = assetsByProject.get(asset.projectId) ?? [];
    list.push(asset);
    assetsByProject.set(asset.projectId, list);
  });

  return snapshot.collections
    .slice()
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ar"))
    .map((collection) => {
      const projects = snapshot.projects
        .filter((project) => project.collectionId === collection.id)
        .slice()
        .sort((a, b) => b.year - a.year || a.title.localeCompare(b.title, "ar"));

      const years = Array.from(new Set(projects.map((project) => project.year)))
        .sort((a, b) => b - a)
        .map((year) => ({
          year,
          projects: projects
            .filter((project) => project.year === year)
            .map((project) => ({
              project,
              links: linksByProject.get(project.id) ?? [],
              assets: assetsByProject.get(project.id) ?? [],
            })),
        }));

      return { collection, years };
    });
}

function getSelectedYear(collection: CollectionBundle | undefined, selectedYear: number | undefined): YearBundle | undefined {
  if (!collection || !selectedYear) return undefined;
  return collection.years.find((year) => year.year === selectedYear) ?? { year: selectedYear, projects: [] };
}

function findProject(explorer: CollectionBundle[], projectId: string) {
  for (const collection of explorer) {
    for (const year of collection.years) {
      const bundle = year.projects.find((item) => item.project.id === projectId);
      if (bundle) return { collection, year, bundle };
    }
  }
  return null;
}

function collectionStats(item: CollectionBundle) {
  return item.years.reduce(
    (stats, year) => {
      year.projects.forEach((bundle) => {
        stats.projects += 1;
        stats.links += bundle.links.length;
        stats.assets += bundle.assets.length;
      });
      return stats;
    },
    { projects: 0, links: 0, assets: 0 },
  );
}

function yearOptions(item: CollectionBundle) {
  const currentYear = new Date().getFullYear();
  const baseYears = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];
  return Array.from(new Set([...item.years.map((year) => year.year), ...baseYears])).sort((a, b) => b - a);
}

function archiveHref({ collectionId, year, projectId }: { collectionId?: string; year?: number; projectId?: string }) {
  const params = new URLSearchParams();
  if (collectionId) params.set("collection", collectionId);
  if (year) params.set("year", String(year));
  if (projectId) params.set("project", projectId);
  const query = params.toString();
  return query ? `/dashboard/archive?${query}` : "/dashboard/archive";
}

function projectMeta(project: ArchiveProject) {
  return [archiveText(project.country), archiveText(project.city), archiveText(project.projectType)].filter(Boolean).join(" / ") || "بدون تفاصيل إضافية";
}

function archiveText(value?: string | null) {
  if (!value) return "";
  const lower = value.toLowerCase();
  if (lower.includes("field documentation")) return "توثيقات ميدانية وملفات إثبات ومواد قابلة للاستخدام.";
  if (lower.includes("al-quds implementation")) return "توثيقات تنفيذية وتقارير ومواد معتمدة للقدس.";
  if (lower.includes("waqf reports")) return "تقارير الوقف والشهادات وملفات الإثبات طويلة المدى.";
  if (lower.includes("zakat documentation")) return "توثيقات الزكاة وملفات إثبات الاستحقاق.";
  if (lower.includes("foundation project") || lower.includes("metadata") || lower.includes("review")) return "مشروع موثق بانتظار استكمال روابط التوثيق والمراجعة.";
  if (lower.includes("planned al-quds")) return "مسار توثيق مخطط لمشروع القدس.";
  if (lower.includes("gaza water folder")) return "رابط توثيق مشروع المياه";
  if (lower.includes("emergency aid")) return "إغاثة طارئة";
  if (lower === "palestine") return "فلسطين";
  if (lower === "gaza") return "غزة";
  if (lower === "al-quds") return "القدس";
  return value;
}

function cleanDriveUrl(value?: string | null) {
  if (!value || !/^https?:\/\//i.test(value)) return "لم يتم إدخال رابط صالح بعد";
  return value;
}

function countYears(explorer: CollectionBundle[]) {
  return new Set(explorer.flatMap((item) => item.years.map((year) => `${item.collection.id}-${year.year}`))).size;
}

function countAssets(assets: ArchiveAsset[], type: ArchiveAsset["fileType"]) {
  return assets.filter((asset) => asset.fileType === type).length;
}

function countOtherAssets(assets: ArchiveAsset[]) {
  return assets.filter((asset) => !["IMAGE", "VIDEO", "DOCUMENT"].includes(asset.fileType)).length;
}

function fileTypeLabel(value: ArchiveAsset["fileType"]) {
  const labels: Record<ArchiveAsset["fileType"], string> = {
    IMAGE: "صورة",
    VIDEO: "فيديو",
    DOCUMENT: "تقرير",
    FOLDER: "مجلد",
    OTHER: "ملف",
  };
  return labels[value] ?? value;
}

function driveLinkTypeLabel(value: ArchiveDriveLink["linkType"]) {
  if (value === "FOLDER") return "مجلد";
  if (value === "FILE") return "ملف";
  return "رابط";
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <div className="rounded-lg border bg-slate-50 p-2.5"><div className="flex items-center justify-between gap-2"><div><p className="text-[11px] font-bold text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-slate-950">{value}</p></div><span className="text-brand [&>svg]:h-4 [&>svg]:w-4">{icon}</span></div></div>;
}

function SummaryCard({ icon, title, value }: { icon: ReactNode; title: string; value: number }) {
  return <div className="rounded-lg border bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black text-slate-950">{title}</p><p className="mt-1 text-xl font-black text-slate-950">{value}</p></div><span className="text-brand [&>svg]:h-4 [&>svg]:w-4">{icon}</span></div></div>;
}

function SmallCounter({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border bg-white px-2 py-1.5"><p className="text-[10px] font-bold text-slate-500">{label}</p><p className="mt-0.5 text-sm font-black text-slate-950">{value}</p></div>;
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-xl border bg-white shadow-sm"><div className="border-b p-4"><h2 className="text-base font-black text-slate-950">{title}</h2>{description ? <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p> : null}</div><div className="p-4">{children}</div></section>;
}

function CompactPanel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-xl border bg-white shadow-sm"><div className="border-b p-3"><h2 className="text-sm font-black text-slate-950">{title}</h2>{description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}</div><div className="p-3">{children}</div></section>;
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">{children}</span>;
}

function EmptyState({ title, text, compact = false }: { title: string; text: string; compact?: boolean }) {
  return <div className={`rounded-xl border border-dashed bg-white text-center ${compact ? "p-4" : "p-8"}`}><Database className="mx-auto h-7 w-7 text-slate-400" /><p className="mt-3 font-black text-slate-950">{title}</p><p className="mt-2 text-sm text-slate-600">{text}</p></div>;
}
