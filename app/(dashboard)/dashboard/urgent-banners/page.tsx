'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Plus, Pencil, Trash2, Loader2, AlertTriangle, MapPin } from 'lucide-react';
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
import { LOCALES } from '@/lib/locales';
import { describePlacement, type BannerTone } from '@/lib/minbar/banner-placements';
import { SortableTable, useReorder, type SortableColumn } from '../_components/SortableTable';

interface BannerRow {
  id: string;
  slug: string;
  title: string;
  image: string;
  ctaUrl: string;
  campaignId: string | null;
  campaignTitle: string | null;
  placements: string[];
  tone: BannerTone;
  priority: number;
  locales: string[];
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  translationCount: number;
  expired: boolean;
  pending: boolean;
}

/** Why a banner is or is not on the site right now. */
function StatusBadge({ row }: { row: BannerRow }) {
  if (!row.isActive) return <Badge variant="secondary">معطّل</Badge>;
  if (row.expired) return <Badge variant="destructive">منتهٍ</Badge>;
  if (row.pending) return <Badge variant="outline">مجدول</Badge>;
  if (!row.placements.length) return <Badge variant="outline" className="text-amber-700 border-amber-300">بلا موضع</Badge>;
  return <Badge className="bg-emerald-600 hover:bg-emerald-600">ظاهر</Badge>;
}

function formatWindow(row: BannerRow): string {
  if (!row.endsAt) return 'حتى الإيقاف';
  return new Date(row.endsAt).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' });
}

const TONE_SWATCH: Record<BannerTone, string> = {
  red: '#A93428',
  navy: '#132C38',
  gold: '#D39A27',
  green: '#1F7A4D',
};

/**
 * Drag to order. The row order here IS the order within every slot on the
 * site — a banner higher in this list renders above one lower down wherever
 * the two share a placement. Persisted once on drop as `priority`.
 */
export default function UrgentBannersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<BannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<BannerRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const res = await axios.get('/api/urgent-banners/admin');
      const items = res.data?.items ?? [];
      setRows(Array.isArray(items) ? items : []);
    } catch (e) {
      console.error(e);
      toast.error(errorMessage(e, 'تعذّر تحميل البانرات'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const { onMove, onCommit } = useReorder(
    rows,
    setRows,
    useCallback(async (payload) => { await axios.post('/api/urgent-banners/reorder', { banners: payload }); }, []),
    useCallback((e: unknown) => { toast.error(errorMessage(e, 'تعذّر حفظ الترتيب')); fetchRows(); }, [fetchRows]),
  );

  const toggleActive = async (row: BannerRow, next: boolean) => {
    setTogglingId(row.id);
    try {
      await axios.put(`/api/urgent-banners/${row.id}`, { isActive: next });
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
      await axios.delete(`/api/urgent-banners/${deleteTarget.id}`);
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      toast.success('تم حذف البانر');
      setDeleteTarget(null);
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر حذف البانر'));
    } finally {
      setDeleting(false);
    }
  };

  const columns: SortableColumn<BannerRow>[] = [
    {
      header: 'البانر',
      cell: (r) => (
        <div className="flex items-center gap-2">
          {r.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.image} alt="" className="w-16 h-10 rounded object-cover border grayscale" style={{ borderColor: TONE_SWATCH[r.tone] }} />
          ) : (
            <div className="w-16 h-10 rounded border grid place-items-center" style={{ background: TONE_SWATCH[r.tone] }}>
              <AlertTriangle className="w-4 h-4 text-white/80" />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold truncate max-w-[16rem]">{r.title}</div>
            <div className="text-xs text-slate-500" dir="ltr">{r.slug}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'أين يظهر',
      cell: (r) =>
        r.placements.length ? (
          <div className="flex flex-wrap gap-1 max-w-[18rem]">
            {r.placements.map((p) => (
              <Badge key={p} variant="outline" className="text-[10px] px-1.5 py-0 font-normal gap-1">
                <MapPin className="w-2.5 h-2.5" />
                {describePlacement(p)}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-amber-700">لم يُحدَّد — لن يظهر</span>
        ),
    },
    {
      header: 'الوجهة',
      className: 'text-xs text-slate-600 max-w-[12rem] truncate',
      cell: (r) => r.campaignTitle ?? (r.ctaUrl ? <span dir="ltr">{r.ctaUrl}</span> : '—'),
    },
    { header: 'الحالة', cell: (r) => <StatusBadge row={r} /> },
    { header: 'ينتهي', className: 'text-xs text-slate-600', cell: (r) => formatWindow(r) },
    {
      header: 'اللغات',
      cell: (r) =>
        r.locales.length === 0 ? (
          <span className="text-xs text-slate-500">الكل</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {r.locales.map((l) => (
              <Badge key={l} variant="outline" className="text-[10px] px-1.5 py-0">
                {LOCALES[l as keyof typeof LOCALES]?.nativeLabel ?? l}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      header: 'مفعّل',
      cell: (r) => <Switch checked={r.isActive} disabled={togglingId === r.id} onCheckedChange={(v) => toggleActive(r, v)} />,
    },
    {
      header: '',
      className: 'w-24',
      cell: (r) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/urgent-banners/edit/${r.id}`)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}>
            <Trash2 className="w-4 h-4 text-red-600" />
          </Button>
        </div>
      ),
    },
  ];

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
          <h1 className="text-lg font-bold">البانرات</h1>
          <p className="text-xs text-slate-500">
            بانرات مثل «شدّ الرحال» تضعها على أي صفحة وموضع. اسحب الصفوف لترتيبها — الأعلى هنا يظهر أولًا حيثما اجتمع بانران في موضع واحد.
          </p>
        </div>
        <Button onClick={() => router.push('/dashboard/urgent-banners/new')}>
          <Plus className="w-4 h-4 ml-1" />
          بانر جديد
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="لا توجد بانرات"
          description="أنشئ بانرًا واختر الصفحات التي يظهر فيها."
          action={
            <Button onClick={() => router.push('/dashboard/urgent-banners/new')}>
              <Plus className="w-4 h-4 ml-1" />
              بانر جديد
            </Button>
          }
        />
      ) : (
        <SortableTable
          rows={rows}
          getId={(r) => r.id}
          columns={columns}
          onMove={onMove}
          onCommit={onCommit}
          isDimmed={(r) => !r.isActive || r.expired}
          dragType="urgent-banner"
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف البانر</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف «{deleteTarget?.title}» وكل ترجماته نهائيًا.
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
