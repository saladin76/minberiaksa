'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Plus, Pencil, Trash2, Loader2, GraduationCap, Pin, ExternalLink } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { SortableTable, useReorder } from '../_components/SortableTable';
import { dt, dtx } from "@/lib/dashboard/i18n";

interface CourseRow {
  id: string;
  slug: string;
  title: string;
  coverImage: string;
  isPinned: boolean;
  isExternal: boolean;
  hasDetailPage: boolean;
  unitsCount: number | null;
  order: number;
  isActive: boolean;
  translationCount: number;
  videoCount: number;
}

export default function CoursesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<CourseRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const res = await axios.get('/api/courses/admin');
      const items = res.data?.items ?? [];
      setRows(Array.isArray(items) ? items : []);
    } catch (e) {
      console.error(e);
      toast.error(errorMessage(e, dt("تعذّر تحميل الدورات")));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const { onMove, onCommit } = useReorder(
    rows,
    setRows,
    useCallback(async (payload) => { await axios.post('/api/courses/reorder', { courses: payload }); }, []),
    useCallback((e: unknown) => { toast.error(errorMessage(e, dt("تعذّر حفظ الترتيب"))); fetchRows(); }, [fetchRows]),
  );

  const toggle = async (row: CourseRow, field: 'isActive' | 'isPinned', next: boolean) => {
    setTogglingId(row.id);
    try {
      await axios.put(`/api/courses/${row.id}`, { [field]: next });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: next } : r)));
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
      await axios.delete(`/api/courses/${deleteTarget.id}`);
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      toast.success(dt("تم حذف الدورة"));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(errorMessage(e, dt("تعذّر حذف الدورة")));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">{dt("دوراتنا")}</h1>
          <p className="text-xs text-slate-500">
            {dt("الدورة المثبّتة تتصدّر شريط الرئيسية. الترتيب هنا هو ترتيب صفحة الدورات.")}</p>
        </div>
        <Button onClick={() => router.push('/dashboard/courses/new')}>
          <Plus className="w-4 h-4 me-1" />
          {dt("دورة جديدة")}</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={dt("لا توجد دورات")}
          description={dt("أضف أول دورة لتظهر في صفحة الدورات.")}
          action={
            <Button onClick={() => router.push('/dashboard/courses/new')}>
              <Plus className="w-4 h-4 me-1" />
              {dt("دورة جديدة")}</Button>
          }
        />
      ) : (
        <SortableTable
          rows={rows}
          getId={(r) => r.id}
          dragType="COURSE_ROW"
          onMove={onMove}
          onCommit={onCommit}
          isDimmed={(r) => !r.isActive}
          columns={[
            {
              header: dt("الدورة"),
              cell: (r) => (
                <div className="flex items-center gap-2">
                  {r.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.coverImage} alt="" className="w-16 h-10 rounded object-cover border" />
                  ) : (
                    <div className="w-16 h-10 rounded border bg-slate-50 grid place-items-center">
                      <GraduationCap className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                  <div>
                    <div className="font-semibold flex items-center gap-1.5">
                      {r.title}
                      {r.isPinned ? <Pin className="w-3.5 h-3.5 text-amber-600" /> : null}
                    </div>
                    <div className="text-xs text-slate-500" dir="ltr">{r.slug}</div>
                  </div>
                </div>
              ),
            },
            {
              header: dt("الشكل"),
              cell: (r) => (
                <div className="flex flex-wrap gap-1">
                  {r.hasDetailPage ? <Badge variant="outline" className="text-[10px]">{dt("صفحة تفاصيل")}</Badge> : null}
                  {r.isExternal ? (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <ExternalLink className="w-3 h-3" />{dt("خارجية")}</Badge>
                  ) : null}
                  {!r.hasDetailPage && !r.isExternal ? <span className="text-xs text-slate-500">{dt("فيديو تعريفي")}</span> : null}
                </div>
              ),
            },
            {
              header: dt("المحتوى"),
              cell: (r) => (
                <span className="text-xs text-slate-600">
                  {dtx("{0} فيديو", [r.videoCount])}{r.unitsCount != null ? dt(" · {0} وحدة", [r.unitsCount]) : ''}
                </span>
              ),
            },
            { header: dt("الترجمات"), cell: (r) => <span className="text-xs text-slate-600">{r.translationCount}</span> },
            {
              header: dt("مثبّتة"),
              cell: (r) => (
                <Switch checked={r.isPinned} disabled={togglingId === r.id} onCheckedChange={(v) => toggle(r, 'isPinned', v)} />
              ),
            },
            {
              header: dt("مفعّلة"),
              cell: (r) => (
                <Switch checked={r.isActive} disabled={togglingId === r.id} onCheckedChange={(v) => toggle(r, 'isActive', v)} />
              ),
            },
            {
              header: '',
              className: 'w-24',
              cell: (r) => (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/courses/edit/${r.id}`)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}>
                    <Trash2 className="w-4 h-4 text-red-600" />
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
            <AlertDialogTitle>{dt("حذف الدورة")}</AlertDialogTitle>
            <AlertDialogDescription>
              {dtx("سيتم حذف «{0}» مع فيديوهاتها وكل ترجماتها نهائيًا.", [deleteTarget?.title])}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{dt("إلغاء")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {dt("حذف")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
