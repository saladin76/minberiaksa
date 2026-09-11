'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Plus, Pencil, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { LOCALES } from '@/lib/locales';

interface BannerRow {
  id: string;
  slug: string;
  title: string;
  image: string;
  ctaUrl: string;
  campaignId: string | null;
  campaignTitle: string | null;
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
  return <Badge className="bg-emerald-600 hover:bg-emerald-600">ظاهر</Badge>;
}

function formatWindow(row: BannerRow): string {
  if (!row.endsAt) return 'حتى الإيقاف';
  return new Date(row.endsAt).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Not drag-sortable: banners order by `priority`, a number the editor sets
 * explicitly, and there are rarely more than one or two live at a time.
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
          <h1 className="text-lg font-bold">بانرات الطوارئ</h1>
          <p className="text-xs text-slate-500">
            نداءات الحملات العاجلة. الأعلى أولوية يظهر أولًا، والبانر يختفي تلقائيًا عند انتهاء مدته.
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
          description="أنشئ بانرًا عند إطلاق حملة طارئة."
          action={
            <Button onClick={() => router.push('/dashboard/urgent-banners/new')}>
              <Plus className="w-4 h-4 ml-1" />
              بانر جديد
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>البانر</TableHead>
                <TableHead>الوجهة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>ينتهي</TableHead>
                <TableHead>الأولوية</TableHead>
                <TableHead>اللغات</TableHead>
                <TableHead>مفعّل</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={`${!r.isActive ? 'bg-muted/30' : ''} hover:bg-muted/50 transition-colors`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {r.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.image} alt="" className="w-16 h-10 rounded object-cover border" />
                      ) : (
                        <div className="w-16 h-10 rounded border bg-slate-50 grid place-items-center">
                          <AlertTriangle className="w-4 h-4 text-slate-400" />
                        </div>
                      )}
                      <div>
                        <div className="font-semibold">{r.title}</div>
                        <div className="text-xs text-slate-500" dir="ltr">{r.slug}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600 max-w-[14rem] truncate">
                    {r.campaignTitle ?? (r.ctaUrl ? <span dir="ltr">{r.ctaUrl}</span> : '—')}
                  </TableCell>
                  <TableCell><StatusBadge row={r} /></TableCell>
                  <TableCell className="text-xs text-slate-600">{formatWindow(r)}</TableCell>
                  <TableCell className="text-xs text-slate-600" dir="ltr">{r.priority}</TableCell>
                  <TableCell>
                    {r.locales.length === 0 ? (
                      <span className="text-xs text-slate-500">الكل</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.locales.map((l) => (
                          <Badge key={l} variant="outline" className="text-[10px] px-1.5 py-0">
                            {LOCALES[l as keyof typeof LOCALES]?.nativeLabel ?? l}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch checked={r.isActive} disabled={togglingId === r.id} onCheckedChange={(v) => toggleActive(r, v)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/urgent-banners/edit/${r.id}`)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
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
