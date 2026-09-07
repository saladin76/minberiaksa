import { ArchiveConsole } from "../_components/ArchiveConsole";
import { getArchiveSnapshotDbBacked } from "@/lib/archive/archive-service";
import { getBrandCenterSnapshot } from "@/lib/brand/brand-service";

export const metadata = { title: "Archive Assets Review | لوحة التحكم" };
export const dynamic = "force-dynamic";

export default async function ArchiveAssetsPage() {
  const [snapshot, brandSnapshot] = await Promise.all([
    getArchiveSnapshotDbBacked(),
    getBrandCenterSnapshot(),
  ]);
  const linkedLegacyAssets = brandSnapshot.assets.filter((asset) => Boolean(asset.fileUrl));

  return (
    <div className="space-y-5" dir="rtl">
      <ArchiveConsole activeTab="assets" snapshot={snapshot} work="classify" />
      {linkedLegacyAssets.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div>
            <p className="text-xs font-bold text-brand">الملفات والأصول / مصادر قديمة</p>
            <h2 className="mt-1 text-xl font-black text-slate-900">أصول مرتبطة سابقًا بقسم الهوية</h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">
              عرض قراءة فقط للملفات ذات الروابط الفعلية. لم يتم نسخ الملفات أوتغيير المعرّفات أوالروابط.
            </p>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {linkedLegacyAssets.map((asset) => (
              <article key={asset.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-black text-slate-900">{asset.title}</h3>
                    <p className="mt-1 text-xs text-slate-500">{asset.type} · {asset.format} · {asset.locale.toUpperCase()}</p>
                  </div>
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600">LEGACY_BRAND</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{asset.usage}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={asset.fileUrl ?? "#"} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md bg-brand px-3 text-xs font-bold text-white hover:bg-brand-700">فتح الملف</a>
                  <span className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-xs font-semibold text-slate-600">ID: {asset.id}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
