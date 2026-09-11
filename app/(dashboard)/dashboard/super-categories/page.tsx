'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Plus, Pencil, Trash2, Loader2, Layers } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { SortableTable, useReorder } from '../_components/SortableTable';

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
  const [rows, setRows] = useState<SuperCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<SuperCategoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const res = await axios.get('/api/super-categories/admin');
      const items = res.data?.items ?? [];
      setRows(Array.isArray(items) ? items : []);
    } catch (e) {
      console.error(e);
      toast.error(errorMessage(e, 'تعذّر تحميل الأقسام الكبرى'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const { onMove, onCommit } = useReorder(
    rows,
    setRows,
    useCallback(async (payload) => { await axios.post('/api/super-categories/reorder', { superCategories: payload }); }, []),
    useCallback((e: unknown) => { toast.error(errorMessage(e, 'تعذّر حفظ الترتيب')); fetchRows(); }, [fetchRows]),
  );

  const toggleActive = async (row: SuperCategoryRow, next: boolean) => {
    setTogglingId(row.id);
    /* Only the flag: omitting `translations`, `items` and `blocks` tells the API
       to leave the whole page exactly as it is. */
    try {
      await axios.put(`/api/super-categories/${row.id}`, { isActive: next });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive: next } : r)));
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر تغيير الحالة'));
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
      toast.success('تم حذف القسم');
      setDeleteTarget(null);
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر حذف القسم'));
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">الأقسام الكبرى</h1>
          <p className="text-xs text-slate-500">
            صفحات برامج كاملة تجمع المشاريع والمقالات والفيديوهات والدورات والتقارير والكتيبات، بواجهة ومحتوى قابلين للتعديل.
          </p>
        </div>
        <Button onClick={() => router.push('/dashboard/super-categories/new')}>
          <Plus className="ml-1 h-4 w-4" />
          قسم جديد
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="لا توجد أقسام كبرى"
          description="أنشئ أول قسم: صفحة برنامج بواجهتها ومحتواها."
          action={
            <Button onClick={() => router.push('/dashboard/super-categories/new')}>
              <Plus className="ml-1 h-4 w-4" />
              قسم جديد
            </Button>
          }
        />
      ) : (
        <SortableTable
          rows={rows}
          getId={(r) => r.id}
          dragType="SUPER_CATEGORY_ROW"
          onMove={onMove}
          onCommit={onCommit}
          isDimmed={(r) => !r.isActive}
          columns={[
            {
              header: 'القسم',
              cell: (r) => (
                <div className="flex items-center gap-2">
                  {r.heroImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.heroImage} alt="" className="h-10 w-16 rounded border object-cover" />
                  ) : (
                    <div
                      className="grid h-10 w-16 place-items-center rounded border"
                      style={{ background: r.accentColor || '#7C2318' }}
                    >
                      <Layers className="h-4 w-4 text-white/80" />
                    </div>
                  )}
                  <div>
                    <div className="font-semibold">{r.title}</div>
                    <div className="text-xs text-slate-500" dir="ltr">/projects/{r.slug}</div>
                  </div>
                </div>
              ),
            },
            { header: 'المحتوى', cell: (r) => <span className="text-xs text-slate-600">{r.itemCount}</span> },
            { header: 'أقسام الصفحة', cell: (r) => <span className="text-xs text-slate-600">{r.blockCount}</span> },
            { header: 'الترجمات', cell: (r) => <span className="text-xs text-slate-600">{r.translationCount}</span> },
            {
              header: 'منشور',
              cell: (r) => (
                <Switch checked={r.isActive} disabled={togglingId === r.id} onCheckedChange={(v) => toggleActive(r, v)} />
              ),
            },
            {
              header: '',
              className: 'w-24',
              cell: (r) => (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/super-categories/edit/${r.id}`)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}>
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
            <AlertDialogTitle>حذف القسم الكبير</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف صفحة «{deleteTarget?.title}» بأقسامها وترجماتها نهائيًا. المشاريع والمقالات وبقية المحتوى المرتبط
              لا تُحذف — يُحذف ارتباطها بهذه الصفحة فقط.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
