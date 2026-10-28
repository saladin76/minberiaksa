'use client';

import { TranslationOverview } from "@/components/dashboard/content-editor/TranslationOverview";
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Plus, Pencil, Trash2, Loader2, Layers, CheckCircle2, Blocks, Languages } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ContentMetricStrip } from '@/components/dashboard/content-editor/ContentMetricStrip';
import { SortableTable, useReorder } from '../_components/SortableTable';
import { miaPath } from "@/lib/minbar/routes";
import { dt, dtx } from "@/lib/dashboard/i18n";

interface SuperCategoryRow {
  id: string;
  slug: string;
  title: string;
  heroImage: string;
  logoImage: string;
  accentColor: string;
  order: number;
  isActive: boolean;
  translationCount: number;
  itemCount: number;
  blockCount: number;
}

export default function SuperCategoriesPage() {
  const router = useRouter();
  const [search, setSearch] = useState(""), [visibility, setVisibility] = useState("all"), [loadError, setLoadError] = useState("");
  const [rows, setRows] = useState<SuperCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<SuperCategoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const res = await axios.get('/api/super-categories/admin');
      const items = res.data?.items ?? [];
      setRows(Array.isArray(items) ? items : []);
    } catch (e) {
      setLoadError(dt("تعذّر تحميل المشاريع الكبرى"));
      toast.error(errorMessage(e, dt("تعذّر تحميل المشاريع الكبرى")));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const { onMove, onCommit } = useReorder(
    rows,
    setRows,
    useCallback(async (payload) => { await axios.post('/api/super-categories/reorder', { superCategories: payload }); }, []),
    useCallback((e: unknown) => { toast.error(errorMessage(e, dt("تعذّر حفظ الترتيب"))); fetchRows(); }, [fetchRows]),
  );

  const toggleActive = async (row: SuperCategoryRow, next: boolean) => {
    setTogglingId(row.id);
    /* Only the flag: omitting `translations`, `items` and `blocks` tells the API
       to leave the whole page exactly as it is. */
    try {
      await axios.put(`/api/super-categories/${row.id}`, { isActive: next });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive: next } : r)));
    } catch (e) {
      toast.error(errorMessage(e, dt("تعذّر تغيير الحالة")));
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/super-categories/${deleteTarget.id}`);
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      toast.success(dt("تم حذف المشروع الكبير"));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(errorMessage(e, dt("تعذّر حذف المشروع الكبير")));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtered = rows.filter(row => (!search.trim() || `${row.title} ${row.slug}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) && (visibility === "all" || row.isActive === (visibility === "published")));
  const filtering = Boolean(search.trim()) || visibility !== "all";
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={dt("المشاريع والتصنيفات")}
        title={dt("المشاريع الكبرى")}
        description={dt("صفحات برامج تجمع المشاريع والمقالات والوسائط في واجهة واحدة. راجع ترتيب الصفحة ومحتواها وترجماتها قبل إتاحتها.")}
        icon={Layers}
        actions={<Button onClick={() => router.push('/dashboard/super-categories/new')}><Plus className="me-1 h-4 w-4" />{dt("مشروع كبير جديد")}</Button>}
      />
      <ContentMetricStrip items={[
        { label: dt("كل الصفحات"), value: rows.length, detail: dt("صفحات برامج محفوظة"), icon: Layers, tone: "brand" },
        { label: dt("منشورة"), value: rows.filter((row) => row.isActive).length, detail: dt("متاحة للزوار"), icon: CheckCircle2, tone: "green" },
        { label: dt("مكوّنات المحتوى"), value: rows.reduce((sum, row) => sum + row.itemCount, 0), detail: dt("عناصر مرتبطة بالصفحات"), icon: Blocks, tone: "amber" },
        { label: dt("ترجمات محفوظة"), value: rows.reduce((sum, row) => sum + row.translationCount, 0), detail: dt("على مستوى الصفحات"), icon: Languages, tone: "slate" },
      ]} />
      <TranslationOverview kind="super-categories" />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"><label className="min-w-48 flex-1 space-y-2 text-sm"><span>{dt("البحث في المشاريع الكبرى")}</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded-lg border p-2" /></label><label className="space-y-2 text-sm"><span>{dt("حالة النشر")}</span><select value={visibility} onChange={event => setVisibility(event.target.value)} className="block rounded-lg border bg-white p-2"><option value="all">{dt("الكل")}</option><option value="published">{dt("منشورة")}</option><option value="draft">{dt("غير منشورة")}</option></select></label><Button variant="outline" onClick={() => void fetchRows()}>{dt("تحديث")}</Button></div>
      {filtering ? <p className="text-xs text-slate-500">{dt("أزل فلاتر البحث قبل تعديل الترتيب العام.")}</p> : null}
      {loadError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm">{loadError}</p> : filtered.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={dt("لا توجد مشاريع كبرى مطابقة")}
          description={dt("غيّر البحث أو أنشئ مشروعًا كبيرًا يجمع المشاريع والمحتوى المرتبط.")}
        />
      ) : (
        <SortableTable
          rows={filtered}
          reorderDisabled={filtering}
          getId={(r) => r.id}
          dragType="SUPER_CATEGORY_ROW"
          onMove={(...args) => { if (!filtering) onMove(...args); }}
          onCommit={() => { if (!filtering) onCommit(); }}
          isDimmed={(r) => !r.isActive}
          columns={[
            {
              header: dt("المشروع الكبير"),
              cell: (r) => (
                <div className="flex items-center gap-2">
                  {r.heroImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.heroImage} alt="" className="h-10 w-16 rounded border object-cover" />
                  ) : (
                    <div
                      className="grid h-10 w-16 place-items-center rounded border bg-slate-50"
                    >
                      <Layers className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    </div>
                  )}
                  <div>
                    <div className="font-semibold">{r.title}</div>
                    <a href={`${miaPath("projectDetail", "ar")}/${r.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 underline" dir="ltr">{miaPath("projectDetail", "ar")}/{r.slug}</a>
                  </div>
                </div>
              ),
            },
            { header: dt("المحتوى"), cell: (r) => <span className="text-xs text-slate-600">{r.itemCount}</span> },
            { header: dt("أقسام الصفحة"), cell: (r) => <span className="text-xs text-slate-600">{r.blockCount}</span> },
            { header: dt("الترجمات"), cell: (r) => <span className="text-xs text-slate-600">{r.translationCount}</span> },
            {
              header: dt("منشور"),
              cell: (r) => (
                <Switch aria-label={`${dt("منشور")} ${r.title}`} checked={r.isActive} disabled={togglingId === r.id} onCheckedChange={(v) => toggleActive(r, v)} />
              ),
            },
            {
              header: '',
              className: 'w-24',
              cell: (r) => (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" aria-label={`${dt("تعديل")} ${r.title}`} onClick={() => router.push(`/dashboard/content/super-categories/${r.id}`)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`${dt("حذف")} ${r.title}`} onClick={() => setDeleteTarget(r)}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dt("حذف المشروع الكبير")}</AlertDialogTitle>
            <AlertDialogDescription>
              {dtx("سيتم حذف صفحة «{0}» بأقسامها وترجماتها نهائيًا. المشاريع والمقالات وبقية المحتوى المرتبط لا تُحذف  يُحذف ارتباطها بهذه الصفحة فقط.", [deleteTarget?.title])}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{dt("إلغاء")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {dt("حذف")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
