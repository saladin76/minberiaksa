'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Plus, Pencil, Trash2, Loader2, Settings, Check, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { errorMessage } from '@/lib/dashboard/client-error-message';

/**
 * Site settings — a key → JSON map, grouped by section.
 *
 * Not a list of rows with an order and translations like the other content
 * sections, so it is one page rather than list + form. A plain string value is
 * edited inline as text; anything else (a list, an object) opens the editor
 * with the JSON, because a phone number should not require typing quotes and
 * a list of social links should not be crammed into a single-line input.
 */

interface SettingRow {
  key: string;
  value: unknown;
  group: string;
  updatedAt: string;
}

/** Strings edit inline; everything else shows as JSON. */
function isPlainString(v: unknown): v is string {
  return typeof v === 'string';
}

function preview(v: unknown): string {
  if (isPlainString(v)) return v;
  const s = JSON.stringify(v);
  return s.length > 80 ? s.slice(0, 77) + '…' : s;
}

/** Parse the editor text: a bare string is allowed, otherwise it must be JSON. */
function parseValue(text: string, asJson: boolean): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!asJson) return { ok: true, value: text };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'القيمة ليست JSON صالحًا' };
  }
}

export default function SiteSettingsPage() {
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Inline string editing.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Dialog for create / JSON edit.
  const [dialog, setDialog] = useState<{ mode: 'create' | 'edit'; key: string; group: string; text: string; asJson: boolean } | null>(null);
  const [dialogSaving, setDialogSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SettingRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRows = useCallback(async () => {
    try {
      const res = await axios.get('/api/site-settings');
      const items = res.data?.items ?? [];
      setRows(Array.isArray(items) ? items : []);
    } catch (e) {
      console.error(e);
      toast.error(errorMessage(e, 'تعذّر تحميل الإعدادات'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const groups = useMemo(() => {
    const map = new Map<string, SettingRow[]>();
    for (const r of rows) {
      const g = r.group || 'عام';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'ar'));
  }, [rows]);

  const save = async (key: string, value: unknown, group?: string) => {
    const res = await axios.put(`/api/site-settings/${encodeURIComponent(key)}`, {
      value,
      ...(group !== undefined ? { group } : {}),
    });
    const saved = res.data as SettingRow;
    setRows((prev) => {
      const exists = prev.some((r) => r.key === key);
      return exists ? prev.map((r) => (r.key === key ? saved : r)) : [...prev, saved];
    });
  };

  const commitInline = async (key: string) => {
    setSavingKey(key);
    try {
      await save(key, draft);
      setEditingKey(null);
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر حفظ الإعداد'));
    } finally {
      setSavingKey(null);
    }
  };

  const openCreate = () => setDialog({ mode: 'create', key: '', group: '', text: '', asJson: false });
  const openJsonEdit = (r: SettingRow) =>
    setDialog({
      mode: 'edit',
      key: r.key,
      group: r.group,
      text: isPlainString(r.value) ? r.value : JSON.stringify(r.value, null, 2),
      asJson: !isPlainString(r.value),
    });

  const commitDialog = async () => {
    if (!dialog) return;
    const key = dialog.key.trim();
    if (!key) return toast.error('المفتاح مطلوب');
    const parsed = parseValue(dialog.text, dialog.asJson);
    if (!parsed.ok) return toast.error(parsed.error);
    setDialogSaving(true);
    try {
      await save(key, parsed.value, dialog.group.trim());
      toast.success(dialog.mode === 'create' ? 'تمت إضافة الإعداد' : 'تم حفظ الإعداد');
      setDialog(null);
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر حفظ الإعداد'));
    } finally {
      setDialogSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/site-settings/${encodeURIComponent(deleteTarget.key)}`);
      setRows((prev) => prev.filter((r) => r.key !== deleteTarget.key));
      toast.success('تم حذف الإعداد');
      setDeleteTarget(null);
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر حذف الإعداد'));
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
          <h1 className="text-lg font-bold">إعدادات الموقع</h1>
          <p className="text-xs text-slate-500">
            بيانات التواصل وروابط التواصل الاجتماعي ورقم واتساب وما شابه. المفتاح بالشكل <span dir="ltr" className="font-mono">contact.phone</span>.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 ml-1" />
          إعداد جديد
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Settings}
          title="لا توجد إعدادات"
          description="أضف أول إعداد — مثل contact.phone أو social.instagram."
          action={
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 ml-1" />
              إعداد جديد
            </Button>
          }
        />
      ) : (
        groups.map(([group, items]) => (
          <Card key={group} className="p-4 space-y-2">
            <h2 className="text-sm font-bold">{group}</h2>
            <div className="divide-y">
              {items.map((r) => {
                const editing = editingKey === r.key;
                const stringy = isPlainString(r.value);
                return (
                  <div key={r.key} className="flex items-center gap-3 py-2">
                    <div className="w-56 shrink-0">
                      <div className="font-mono text-xs" dir="ltr">{r.key}</div>
                      {!stringy ? <Badge variant="outline" className="mt-1 text-[10px]">JSON</Badge> : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      {editing ? (
                        <Input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitInline(r.key);
                            if (e.key === 'Escape') setEditingKey(null);
                          }}
                        />
                      ) : (
                        <div className="text-sm truncate" dir="auto">{preview(r.value) || <span className="text-slate-400">—</span>}</div>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {editing ? (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => commitInline(r.key)} disabled={savingKey === r.key}>
                            {savingKey === r.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-emerald-600" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setEditingKey(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => (isPlainString(r.value) ? (setEditingKey(r.key), setDraft(r.value)) : openJsonEdit(r))}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}>
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'create' ? 'إعداد جديد' : `تعديل ${dialog?.key}`}</DialogTitle>
            <DialogDescription>
              القيمة نص عادي افتراضيًا. فعّل JSON لقائمة أو كائن.
            </DialogDescription>
          </DialogHeader>
          {dialog ? (
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">المفتاح *</span>
                <Input
                  dir="ltr"
                  placeholder="contact.phone"
                  value={dialog.key}
                  disabled={dialog.mode === 'edit'}
                  onChange={(e) => setDialog({ ...dialog, key: e.target.value.toLowerCase() })}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">المجموعة</span>
                <Input placeholder="التواصل" value={dialog.group} onChange={(e) => setDialog({ ...dialog, group: e.target.value })} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={dialog.asJson}
                  onChange={(e) => setDialog({ ...dialog, asJson: e.target.checked })}
                />
                القيمة JSON
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">القيمة *</span>
                <Textarea
                  dir={dialog.asJson ? 'ltr' : 'auto'}
                  rows={dialog.asJson ? 8 : 3}
                  className={dialog.asJson ? 'font-mono text-xs' : ''}
                  placeholder={dialog.asJson ? '["https://instagram.com/…", "https://x.com/…"]' : '+90 555 000 00 00'}
                  value={dialog.text}
                  onChange={(e) => setDialog({ ...dialog, text: e.target.value })}
                />
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={dialogSaving}>إلغاء</Button>
            <Button onClick={commitDialog} disabled={dialogSaving}>
              {dialogSaving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الإعداد</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف <span dir="ltr" className="font-mono">{deleteTarget?.key}</span> نهائيًا. أي جزء من الموقع يقرؤه سيجده فارغًا.
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
