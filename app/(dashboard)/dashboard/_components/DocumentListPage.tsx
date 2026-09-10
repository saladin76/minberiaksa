'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Plus, Pencil, Trash2, Loader2, GripVertical, FileText, ExternalLink } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import type { DocumentSectionCopy } from './DocumentForm';

/**
 * The shared listing for the two document sections, reports and booklets.
 *
 * Same reasoning as `DocumentForm`: one row shape, one difference (the year
 * column), so one component rather than two near-identical pages.
 */

export interface DocumentRow {
  id: string;
  slug: string;
  title: string;
  fileUrl: string;
  coverImage: string;
  year: number | null;
  order: number;
  isPublished: boolean;
  translationCount: number;
}

const DOC_ROW = 'DOC_ROW';

function DraggableDocRow({
  row, index, moveRow, commitOrder, children,
}: {
  row: DocumentRow;
  index: number;
  moveRow: (from: number, to: number) => void;
  commitOrder: () => void;
  children: React.ReactNode;
}) {
  const [{ isDragging }, drag, preview] = useDrag({
    type: DOC_ROW,
    item: { index },
    /* Persist once on drop. `hover` fires for every row the pointer crosses, so
       saving there sends one transaction per tick and the responses can land
       out of order. */
    end: () => commitOrder(),
    collect: (m) => ({ isDragging: m.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: DOC_ROW,
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
      className={`${isDragging ? 'opacity-50' : ''} ${!row.isPublished ? 'bg-muted/30' : ''} hover:bg-muted/50 transition-colors`}
    >
      <TableCell className="w-12 p-2 cursor-grab active:cursor-grabbing" ref={handleRef}>
        <GripVertical className="w-5 h-5 text-muted-foreground mx-auto" />
      </TableCell>
      {children}
    </TableRow>
  );
}

export function DocumentListPage({
  copy,
  /** Key the reorder endpoint expects, e.g. "reports". */
  reorderKey,
  description,
  emptyDescription,
}: {
  copy: DocumentSectionCopy;
  reorderKey: string;
  description: string;
  emptyDescription: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const res = await axios.get(`${copy.endpoint}/admin`);
      const items = res.data?.items ?? [];
      setRows(Array.isArray(items) ? items : []);
    } catch (e) {
      /* Surfaced rather than logged only: a failed load and "nothing yet"
         otherwise render identically and nothing says which happened. */
      console.error(e);
      toast.error(errorMessage(e, `تعذّر تحميل ${copy.section}`));
    } finally {
      setLoading(false);
    }
  }, [copy.endpoint, copy.section]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const latest = useRef(rows);
  latest.current = rows;
  const orderDirty = useRef(false);

  const moveRow = useCallback((from: number, to: number) => {
    orderDirty.current = true;
    setRows((prev) => {
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
  }, []);

  const commitOrder = useCallback(async () => {
    if (!orderDirty.current) return;
    orderDirty.current = false;
    const payload = latest.current.map((r, i) => ({ id: r.id, order: i }));
    try {
      await axios.post(`${copy.endpoint}/reorder`, { [reorderKey]: payload });
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر حفظ الترتيب'));
      fetchRows();
    }
  }, [copy.endpoint, reorderKey, fetchRows]);

  const togglePublished = async (row: DocumentRow, next: boolean) => {
    setTogglingId(row.id);
    /* Only the flag is sent. Echoing the whole row back would let a stale field
       the list is holding overwrite good data — and omitting `translations` is
       what tells the API to leave the translation rows alone. */
    try {
      await axios.put(`${copy.endpoint}/${row.id}`, { isPublished: next });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, isPublished: next } : r)));
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
      await axios.delete(`${copy.endpoint}/${deleteTarget.id}`);
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      toast.success(`تم حذف ${copy.singular}`);
      setDeleteTarget(null);
    } catch (e) {
      toast.error(errorMessage(e, `تعذّر حذف ${copy.singular}`));
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
            <h1 className="text-lg font-bold">{copy.section}</h1>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
          <Button onClick={() => router.push(`${copy.basePath}/new`)}>
            <Plus className="w-4 h-4 ml-1" />
            {copy.singular} جديد
          </Button>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={`لا توجد ${copy.section}`}
            description={emptyDescription}
            action={
              <Button onClick={() => router.push(`${copy.basePath}/new`)}>
                <Plus className="w-4 h-4 ml-1" />
                {copy.singular} جديد
              </Button>
            }
          />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12" />
                  <TableHead>الغلاف</TableHead>
                  <TableHead>العنوان</TableHead>
                  {copy.showYear ? <TableHead>السنة</TableHead> : null}
                  <TableHead>الملف</TableHead>
                  <TableHead>الترجمات</TableHead>
                  <TableHead>منشور</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <DraggableDocRow
                    key={row.id}
                    row={row}
                    index={index}
                    moveRow={moveRow}
                    commitOrder={commitOrder}
                  >
                    <TableCell>
                      {row.coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.coverImage} alt="" className="w-10 h-14 rounded object-cover border" />
                      ) : (
                        <div className="w-10 h-14 rounded border bg-slate-50 grid place-items-center">
                          <FileText className="w-4 h-4 text-slate-400" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold">{row.title}</div>
                      <div className="text-xs text-slate-500" dir="ltr">{row.slug}</div>
                    </TableCell>
                    {copy.showYear ? (
                      <TableCell className="text-xs text-slate-600" dir="ltr">{row.year ?? '—'}</TableCell>
                    ) : null}
                    <TableCell>
                      <a
                        href={row.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 underline"
                      >
                        فتح
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{row.translationCount}</TableCell>
                    <TableCell>
                      <Switch
                        checked={row.isPublished}
                        disabled={togglingId === row.id}
                        onCheckedChange={(v) => togglePublished(row, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`${copy.basePath}/edit/${row.id}`)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(row)}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </DraggableDocRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>حذف {copy.singular}</AlertDialogTitle>
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
    </DndProvider>
  );
}
