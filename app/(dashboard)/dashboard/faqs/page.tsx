'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Plus, Pencil, Trash2, Loader2, GripVertical, HelpCircle } from 'lucide-react';
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

interface FaqRow {
  id: string;
  question: string;
  answer: string;
  page: string;
  order: number;
  isActive: boolean;
  translationCount: number;
}

const FAQ_ROW = 'FAQ_ROW';

function DraggableFaqRow({
  faq, index, moveRow, commitOrder, children,
}: {
  faq: FaqRow;
  index: number;
  moveRow: (from: number, to: number) => void;
  commitOrder: () => void;
  children: React.ReactNode;
}) {
  const [{ isDragging }, drag, preview] = useDrag({
    type: FAQ_ROW,
    item: { index },
    /* Persist once on drop. `hover` fires for every row the pointer crosses, so
       saving there sends one transaction per tick and the responses can land
       out of order. */
    end: () => commitOrder(),
    collect: (m) => ({ isDragging: m.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: FAQ_ROW,
    hover: (item: { index: number }) => {
      if (item.index === index) return;
      moveRow(item.index, index);
      item.index = index;
    },
  });

  /* react-dnd's connectors return the node they were given, while React 19's
     `Ref` callback type must return void or a cleanup function; wrapping
     discards the return value. */
  const rowRef = (node: HTMLTableRowElement | null) => {
    preview(drop(node));
  };
  const handleRef = (node: HTMLTableCellElement | null) => {
    drag(node);
  };

  return (
    <TableRow
      ref={rowRef}
      className={`${isDragging ? 'opacity-50' : ''} ${!faq.isActive ? 'bg-muted/30' : ''} hover:bg-muted/50 transition-colors`}
    >
      <TableCell className="w-12 p-2 cursor-grab active:cursor-grabbing" ref={handleRef}>
        <GripVertical className="w-5 h-5 text-muted-foreground mx-auto" />
      </TableCell>
      {children}
    </TableRow>
  );
}

export default function FaqsPage() {
  const router = useRouter();
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<FaqRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchFaqs = useCallback(async () => {
    try {
      const res = await axios.get('/api/faqs/admin');
      const items = res.data?.items ?? [];
      setFaqs(Array.isArray(items) ? items : []);
    } catch (e) {
      /* Surfaced rather than logged only: a failed load and "nothing yet"
         otherwise render identically and nothing says which happened. */
      console.error(e);
      toast.error(errorMessage(e, 'تعذّر تحميل الأسئلة'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFaqs(); }, [fetchFaqs]);

  const latest = useRef(faqs);
  latest.current = faqs;
  const orderDirty = useRef(false);

  const moveRow = useCallback((from: number, to: number) => {
    orderDirty.current = true;
    setFaqs((prev) => {
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
  }, []);

  const commitOrder = useCallback(async () => {
    if (!orderDirty.current) return;
    orderDirty.current = false;
    const payload = latest.current.map((f, i) => ({ id: f.id, order: i }));
    try {
      await axios.post('/api/faqs/reorder', { faqs: payload });
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر حفظ الترتيب'));
      fetchFaqs();
    }
  }, [fetchFaqs]);

  const toggleActive = async (faq: FaqRow, next: boolean) => {
    setTogglingId(faq.id);
    /* Only the flag is sent. Echoing the whole row back would let a stale field
       the list is holding overwrite good data — and omitting `translations` is
       what tells the API to leave the translation rows alone. */
    try {
      await axios.put(`/api/faqs/${faq.id}`, { isActive: next });
      setFaqs((prev) => prev.map((f) => (f.id === faq.id ? { ...f, isActive: next } : f)));
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
      await axios.delete(`/api/faqs/${deleteTarget.id}`);
      setFaqs((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      toast.success('تم حذف السؤال');
      setDeleteTarget(null);
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر حذف السؤال'));
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
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">الأسئلة الشائعة</h1>
            <p className="text-xs text-slate-500">
              السؤال بلا صفحة محددة يظهر في كل الصفحات التي تعرض الأسئلة الشائعة.
            </p>
          </div>
          <Button onClick={() => router.push('/dashboard/faqs/new')}>
            <Plus className="w-4 h-4 ml-1" />
            سؤال جديد
          </Button>
        </div>

        {faqs.length === 0 ? (
          <EmptyState
            icon={HelpCircle}
            title="لا توجد أسئلة"
            description="أضف أول سؤال ليظهر في قسم الأسئلة الشائعة."
            action={
              <Button onClick={() => router.push('/dashboard/faqs/new')}>
                <Plus className="w-4 h-4 ml-1" />
                سؤال جديد
              </Button>
            }
          />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12" />
                  <TableHead>السؤال</TableHead>
                  <TableHead>الصفحة</TableHead>
                  <TableHead>الترجمات</TableHead>
                  <TableHead>مفعّل</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {faqs.map((faq, index) => (
                  <DraggableFaqRow
                    key={faq.id}
                    faq={faq}
                    index={index}
                    moveRow={moveRow}
                    commitOrder={commitOrder}
                  >
                    <TableCell className="max-w-[28rem]">
                      <div className="font-semibold">{faq.question}</div>
                      <div className="text-xs text-slate-500 line-clamp-1">{faq.answer}</div>
                    </TableCell>
                    <TableCell>
                      {faq.page ? (
                        <Badge variant="outline" className="text-[10px]" >{faq.page}</Badge>
                      ) : (
                        <span className="text-xs text-slate-500">كل الصفحات</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{faq.translationCount}</TableCell>
                    <TableCell>
                      <Switch
                        checked={faq.isActive}
                        disabled={togglingId === faq.id}
                        onCheckedChange={(v) => toggleActive(faq, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/dashboard/faqs/edit/${faq.id}`)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(faq)}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </DraggableFaqRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>حذف السؤال</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم حذف «{deleteTarget?.question}» وكل ترجماته نهائيًا.
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
    </DndProvider>
  );
}
