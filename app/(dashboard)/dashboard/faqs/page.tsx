'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Plus, Pencil, Trash2, Loader2, GripVertical, HelpCircle, Search, CheckCircle2, CircleX } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { dt, dtx } from "@/lib/dashboard/i18n";
import { PageHeader } from "@/components/dashboard/PageHeader";

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
  faq, index, moveRow, commitOrder, children, reorderable,
}: {
  faq: FaqRow;
  index: number;
  moveRow: (from: number, to: number) => void;
  commitOrder: () => void;
  children: React.ReactNode;
  reorderable: boolean;
}) {
  const [{ isDragging }, drag, preview] = useDrag({
    type: FAQ_ROW,
    item: { index },
    canDrag: reorderable,
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
      <TableCell className={"w-12 p-2 " + (reorderable ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed opacity-40")} ref={handleRef} title={reorderable ? dt("اسحب لإعادة الترتيب") : dt("أوقف البحث لإعادة الترتيب")}>
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
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const fetchFaqs = useCallback(async () => {
    try {
      const res = await axios.get('/api/faqs/admin');
      const items = res.data?.items ?? [];
      setFaqs(Array.isArray(items) ? items : []);
    } catch (e) {
      /* Surfaced rather than logged only: a failed load and "nothing yet"
         otherwise render identically and nothing says which happened. */
      console.error(e);
      toast.error(errorMessage(e, dt("تعذّر تحميل الأسئلة")));
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
      toast.error(errorMessage(e, dt("تعذّر حفظ الترتيب")));
      fetchFaqs();
    }
  }, [fetchFaqs]);

  const toggleActive = async (faq: FaqRow, next: boolean) => {
    setTogglingId(faq.id);
    /* Only the flag is sent. Echoing the whole row back would let a stale field
       the list is holding overwrite good data  and omitting `translations` is
       what tells the API to leave the translation rows alone. */
    try {
      await axios.put(`/api/faqs/${faq.id}`, { isActive: next });
      setFaqs((prev) => prev.map((f) => (f.id === faq.id ? { ...f, isActive: next } : f)));
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
      await axios.delete(`/api/faqs/${deleteTarget.id}`);
      setFaqs((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      toast.success(dt("تم حذف السؤال"));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(errorMessage(e, dt("تعذّر حذف السؤال")));
    } finally {
      setDeleting(false);
    }
  };

  const activeCount = faqs.filter((faq) => faq.isActive).length;
  const filteredFaqs = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return faqs.filter((faq) => {
      const matchesQuery = !term || [faq.question, faq.answer, faq.page].some((value) => value.toLocaleLowerCase().includes(term));
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? faq.isActive : !faq.isActive);
      return matchesQuery && matchesStatus;
    });
  }, [faqs, query, statusFilter]);
  const canReorder = !query.trim() && statusFilter === "all";

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
        <PageHeader
          title={dt("الأسئلة الشائعة")}
          description={dt("نظّم الإجابات حسب الصفحة، راجع اكتمال الترجمة، وابحث قبل إضافة سؤال مكرر.")}
          icon={HelpCircle}
          actions={<Button onClick={() => router.push('/dashboard/faqs/new')}><Plus className="me-1 h-4 w-4" />{dt("سؤال جديد")}</Button>}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4"><p className="text-xs text-slate-500">{dt("إجمالي الأسئلة")}</p><p className="mt-1 text-2xl font-bold">{faqs.length}</p></Card>
          <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{dt("مفعّلة")}</p><p className="mt-1 text-2xl font-bold text-emerald-700">{activeCount}</p></Card>
          <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500"><CircleX className="h-3.5 w-3.5 text-slate-400" />{dt("متوقفة")}</p><p className="mt-1 text-2xl font-bold text-slate-600">{faqs.length - activeCount}</p></Card>
        </div>
        <Card className="p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={dt("ابحث في السؤال أو الإجابة أو الصفحة")} className="pe-9" aria-label={dt("ابحث في الأسئلة الشائعة")} />
            </div>
            <div role="group" aria-label={dt("تصفية حسب الحالة")} className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {([
                ["all", dt("الكل")],
                ["active", dt("مفعّلة")],
                ["inactive", dt("متوقفة")],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)} className={"rounded-md px-3 py-1.5 text-xs font-semibold " + (statusFilter === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>{label}</button>
              ))}
            </div>
          </div>
          {!canReorder && <p className="mt-2 text-xs text-amber-700">{dt("أزل البحث واختر «الكل» لإعادة ترتيب الأسئلة بالسحب.")}</p>}
        </Card>

        {faqs.length === 0 ? (
          <EmptyState
            icon={HelpCircle}
            title={dt("لا توجد أسئلة")}
            description={dt("أضف أول سؤال ليظهر في قسم الأسئلة الشائعة.")}
            action={
              <Button onClick={() => router.push('/dashboard/faqs/new')}>
                <Plus className="w-4 h-4 me-1" />
                {dt("سؤال جديد")}</Button>
            }
          />
        ) : filteredFaqs.length === 0 ? (
          <EmptyState variant="inline" icon={Search} title={dt("لا توجد نتائج مطابقة")} description={dt("غيّر عبارة البحث أو مرشح الحالة.")} />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12" />
                  <TableHead>{dt("السؤال")}</TableHead>
                  <TableHead>{dt("الصفحة")}</TableHead>
                  <TableHead>{dt("الترجمات")}</TableHead>
                  <TableHead>{dt("مفعّل")}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFaqs.map((faq) => (
                  <DraggableFaqRow
                    key={faq.id}
                    faq={faq}
                    index={faqs.findIndex((row) => row.id === faq.id)}
                    moveRow={moveRow}
                    commitOrder={commitOrder}
                    reorderable={canReorder}
                  >
                    <TableCell className="max-w-[28rem]">
                      <div className="font-semibold">{faq.question}</div>
                      <div className="text-xs text-slate-500 line-clamp-1">{faq.answer}</div>
                    </TableCell>
                    <TableCell>
                      {faq.page ? (
                        <Badge variant="outline" className="text-[10px]" >{faq.page}</Badge>
                      ) : (
                        <span className="text-xs text-slate-500">{dt("كل الصفحات")}</span>
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
              <AlertDialogTitle>{dt("حذف السؤال")}</AlertDialogTitle>
              <AlertDialogDescription>
                {dtx("سيتم حذف «{0}» وكل ترجماته نهائيًا.", [deleteTarget?.question])}</AlertDialogDescription>
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
    </DndProvider>
  );
}
