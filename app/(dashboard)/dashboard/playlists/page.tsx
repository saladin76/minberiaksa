'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Plus, Pencil, Trash2, Loader2, ListVideo } from 'lucide-react';
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
import { PLAYLIST_KIND_LABELS } from './_components/PlaylistForm';

interface PlaylistRow {
  id: string;
  slug: string;
  title: string;
  kind: string;
  coverImage: string;
  youtubePlaylistUrl: string;
  order: number;
  isActive: boolean;
  translationCount: number;
  videoCount: number;
}

export default function PlaylistsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PlaylistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<PlaylistRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const res = await axios.get('/api/playlists/admin');
      const items = res.data?.items ?? [];
      setRows(Array.isArray(items) ? items : []);
    } catch (e) {
      console.error(e);
      toast.error(errorMessage(e, 'تعذّر تحميل قوائم التشغيل'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const { onMove, onCommit } = useReorder(
    rows,
    setRows,
    useCallback(async (payload) => { await axios.post('/api/playlists/reorder', { playlists: payload }); }, []),
    useCallback((e: unknown) => { toast.error(errorMessage(e, 'تعذّر حفظ الترتيب')); fetchRows(); }, [fetchRows]),
  );

  const toggleActive = async (row: PlaylistRow, next: boolean) => {
    setTogglingId(row.id);
    /* Only the flag: omitting `translations` and `videos` tells the API to
       leave both alone. */
    try {
      await axios.put(`/api/playlists/${row.id}`, { isActive: next });
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
      await axios.delete(`/api/playlists/${deleteTarget.id}`);
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      toast.success('تم حذف قائمة التشغيل');
      setDeleteTarget(null);
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر حذف قائمة التشغيل'));
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
          <h1 className="text-lg font-bold">برامجنا المصورة</h1>
          <p className="text-xs text-slate-500">قوائم التشغيل والسلاسل وحلقاتها كما تظهر على الموقع.</p>
        </div>
        <Button onClick={() => router.push('/dashboard/playlists/new')}>
          <Plus className="w-4 h-4 ml-1" />
          قائمة جديدة
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ListVideo}
          title="لا توجد قوائم تشغيل"
          description="أضف أول برنامج أو سلسلة وحلقاته."
          action={
            <Button onClick={() => router.push('/dashboard/playlists/new')}>
              <Plus className="w-4 h-4 ml-1" />
              قائمة جديدة
            </Button>
          }
        />
      ) : (
        <SortableTable
          rows={rows}
          getId={(r) => r.id}
          dragType="PLAYLIST_ROW"
          onMove={onMove}
          onCommit={onCommit}
          isDimmed={(r) => !r.isActive}
          columns={[
            {
              header: 'القائمة',
              cell: (r) => (
                <div className="flex items-center gap-2">
                  {r.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.coverImage} alt="" className="w-16 h-10 rounded object-cover border" />
                  ) : (
                    <div className="w-16 h-10 rounded border bg-slate-50 grid place-items-center">
                      <ListVideo className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                  <div>
                    <div className="font-semibold">{r.title}</div>
                    <div className="text-xs text-slate-500" dir="ltr">{r.slug}</div>
                  </div>
                </div>
              ),
            },
            { header: 'النوع', cell: (r) => <Badge variant="outline">{PLAYLIST_KIND_LABELS[r.kind] ?? r.kind}</Badge> },
            { header: 'الحلقات', cell: (r) => <span className="text-xs text-slate-600">{r.videoCount}</span> },
            { header: 'الترجمات', cell: (r) => <span className="text-xs text-slate-600">{r.translationCount}</span> },
            {
              header: 'مفعّلة',
              cell: (r) => (
                <Switch checked={r.isActive} disabled={togglingId === r.id} onCheckedChange={(v) => toggleActive(r, v)} />
              ),
            },
            {
              header: '',
              className: 'w-24',
              cell: (r) => (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/playlists/edit/${r.id}`)}>
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
            <AlertDialogTitle>حذف قائمة التشغيل</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف «{deleteTarget?.title}» مع {deleteTarget?.videoCount ?? 0} حلقة وكل ترجماتها نهائيًا.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
