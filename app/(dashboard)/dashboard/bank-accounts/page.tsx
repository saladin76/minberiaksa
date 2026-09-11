'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Plus, Pencil, Trash2, Loader2, Landmark } from 'lucide-react';
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
import { SortableTable, useReorder } from '../_components/SortableTable';

interface BankRow {
  id: string;
  slug: string;
  name: string;
  branch: string;
  holder: string;
  logo: string;
  locales: string[];
  order: number;
  isActive: boolean;
  currencyCodes: string[];
  translationCount: number;
}

export default function BankAccountsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<BankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<BankRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const res = await axios.get('/api/bank-accounts/admin');
      const items = res.data?.items ?? [];
      setRows(Array.isArray(items) ? items : []);
    } catch (e) {
      console.error(e);
      toast.error(errorMessage(e, 'تعذّر تحميل الحسابات البنكية'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const { onMove, onCommit } = useReorder(
    rows,
    setRows,
    useCallback(async (payload) => { await axios.post('/api/bank-accounts/reorder', { bankAccounts: payload }); }, []),
    useCallback((e: unknown) => { toast.error(errorMessage(e, 'تعذّر حفظ الترتيب')); fetchRows(); }, [fetchRows]),
  );

  const toggleActive = async (row: BankRow, next: boolean) => {
    setTogglingId(row.id);
    try {
      await axios.put(`/api/bank-accounts/${row.id}`, { isActive: next });
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
      await axios.delete(`/api/bank-accounts/${deleteTarget.id}`);
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      toast.success('تم حذف الحساب البنكي');
      setDeleteTarget(null);
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر حذف الحساب البنكي'));
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
          <h1 className="text-lg font-bold">الحسابات البنكية</h1>
          <p className="text-xs text-slate-500">
            وجهات التحويل البنكي المنشورة للمتبرعين. يمكن قصر كل حساب على لغات بعينها.
          </p>
        </div>
        <Button onClick={() => router.push('/dashboard/bank-accounts/new')}>
          <Plus className="w-4 h-4 ml-1" />
          حساب جديد
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="لا توجد حسابات بنكية"
          description="أضف الحسابات من المستندات الرسمية لتظهر في صفحة التحويل البنكي."
          action={
            <Button onClick={() => router.push('/dashboard/bank-accounts/new')}>
              <Plus className="w-4 h-4 ml-1" />
              حساب جديد
            </Button>
          }
        />
      ) : (
        <SortableTable
          rows={rows}
          getId={(r) => r.id}
          dragType="BANK_ROW"
          onMove={onMove}
          onCommit={onCommit}
          isDimmed={(r) => !r.isActive}
          columns={[
            {
              header: 'البنك',
              cell: (r) => (
                <div className="flex items-center gap-2">
                  {r.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.logo} alt="" className="w-12 h-8 rounded object-contain border bg-white" />
                  ) : (
                    <div className="w-12 h-8 rounded border bg-slate-50 grid place-items-center">
                      <Landmark className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                  <div>
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.holder}{r.branch ? ` · ${r.branch}` : ''}</div>
                  </div>
                </div>
              ),
            },
            {
              header: 'العملات',
              cell: (r) => (
                <div className="flex flex-wrap gap-1">
                  {r.currencyCodes.map((c) => (
                    <Badge key={c} variant="outline" className="text-[10px] px-1.5 py-0" dir="ltr">{c}</Badge>
                  ))}
                </div>
              ),
            },
            {
              header: 'اللغات',
              cell: (r) =>
                r.locales.length === 0 ? (
                  <span className="text-xs text-slate-500">كل اللغات</span>
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
            { header: 'الترجمات', cell: (r) => <span className="text-xs text-slate-600">{r.translationCount}</span> },
            {
              header: 'مفعّل',
              cell: (r) => (
                <Switch checked={r.isActive} disabled={togglingId === r.id} onCheckedChange={(v) => toggleActive(r, v)} />
              ),
            },
            {
              header: '',
              className: 'w-24',
              cell: (r) => (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/bank-accounts/edit/${r.id}`)}>
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
            <AlertDialogTitle>حذف الحساب البنكي</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف «{deleteTarget?.name}» بكل عملاته وترجماته نهائيًا، ولن يظهر للمتبرعين بعدها.
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
