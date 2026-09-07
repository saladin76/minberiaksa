'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Plus, Pencil, Trash2, Loader2, GripVertical, Eye, EyeOff, Image as ImageIcon } from 'lucide-react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-hot-toast';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { ContentLocalizationAuditCard } from '../_components/ContentLocalizationAuditCard';

interface Slide {
  id: string;
  title: string;
  description: string | null;
  image: string | null;
  showButton: boolean;
  buttonText: string | null;
  buttonLink: string | null;
  isActive: boolean;
  order: number;
}

const SLIDE_ROW = 'SLIDE_ROW';

function DraggableSlideRow({
  slide,
  index,
  moveRow,
  commitOrder,
  children,
}: {
  slide: Slide;
  index: number;
  moveRow: (dragIndex: number, hoverIndex: number) => void;
  commitOrder: () => void;
  children: React.ReactNode;
}) {
  const [{ isDragging }, drag, preview] = useDrag({
    type: SLIDE_ROW,
    item: { index },
    // `hover` fires on every row the pointer crosses, so persisting there sent
    // one full transaction + audit write per tick — dragging across five rows
    // meant five overlapping saves whose responses could land out of order.
    // The reorder is now written once, when the drag actually ends.
    end: () => commitOrder(),
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: SLIDE_ROW,
    hover: (item: { index: number }) => {
      if (item.index === index) return;
      moveRow(item.index, index);
      item.index = index;
    },
  });

  return (
    <TableRow
      ref={(node) => preview(drop(node))}
      className={`${isDragging ? 'opacity-50' : ''} ${!slide.isActive ? 'bg-muted/30' : ''} hover:bg-muted/50 transition-colors`}
    >
      <TableCell className="w-12 p-2 cursor-grab active:cursor-grabbing" ref={drag}>
        <GripVertical className="w-5 h-5 text-muted-foreground mx-auto" />
      </TableCell>
      {children}
    </TableRow>
  );
}

export default function SlidesPage() {
  const router = useRouter();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Slide | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchSlides = async () => {
    try {
      const res = await axios.get('/api/slides/admin');
      const items = res.data?.items ?? [];
      setSlides(Array.isArray(items) ? items.sort((a: Slide, b: Slide) => (a.order ?? 0) - (b.order ?? 0)) : []);
    } catch (e) {
      // Was a bare console.error, so a failed load looked identical to "no
      // slides yet" — the empty state rendered and nothing said why.
      console.error(e);
      toast.error(errorMessage(e, 'تعذّر تحميل الشرائح'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSlides(); }, []);

  // `moveRow` only reorders locally while the pointer moves; `commitOrder`
  // persists once on drop. The ref lets the drag-end callback read the final
  // order without re-subscribing the drag source on every intermediate render.
  const latestSlides = useRef(slides);
  latestSlides.current = slides;
  const orderDirty = useRef(false);

  const moveRow = useCallback((dragIndex: number, hoverIndex: number) => {
    orderDirty.current = true;
    setSlides((prev) => {
      const next = [...prev];
      const [removed] = next.splice(dragIndex, 1);
      next.splice(hoverIndex, 0, removed);
      return next;
    });
  }, []);

  const commitOrder = useCallback(() => {
    if (!orderDirty.current) return;
    orderDirty.current = false;
    const snapshot = latestSlides.current;
    setSavingOrder(true);
    axios
      .post('/api/slides/reorder', {
        slides: snapshot.map((s, i) => ({ id: s.id, order: i })),
      })
      .then(() => toast.success('تم تحديث الترتيب'))
      .catch((e) => toast.error(errorMessage(e, 'فشل في حفظ الترتيب')))
      .finally(() => setSavingOrder(false));
  }, []);

  const handleToggleActive = async (slide: Slide) => {
    setTogglingId(slide.id);
    const nextActive = !slide.isActive;
    try {
      // Send only the field being changed. Echoing the whole row back meant the
      // toggle rewrote every column from whatever the list happened to hold.
      await axios.put(`/api/slides/${slide.id}`, { isActive: nextActive });
      setSlides(prev => prev.map(s => s.id === slide.id ? { ...s, isActive: nextActive } : s));
      toast.success(nextActive ? 'تم التفعيل' : 'تم إلغاء التفعيل');
    } catch (e) {
      toast.error(errorMessage(e, 'فشل في تحديث الحالة'));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/slides/${deleteTarget.id}`);
      setSlides(prev => prev.filter(s => s.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success('تم الحذف');
    } catch (e) {
      toast.error(errorMessage(e, 'فشل الحذف'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">شرائح الهيرو</h1>
          <p className="text-muted-foreground mt-1">إدارة شرائح العرض الرئيسية</p>
        </div>
        <div className="flex items-center gap-3">
          {savingOrder && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>جاري حفظ الترتيب...</span>
            </div>
          )}
          <Button onClick={() => router.push('/dashboard/slides/new')} size="lg" className="gap-2">
            <Plus className="w-5 h-5" /> إضافة شريحة
          </Button>
        </div>
      </div>

      <ContentLocalizationAuditCard section="slides" />

      <Card>
        <DndProvider backend={HTML5Backend}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12"></TableHead>
                  <TableHead className="w-32">الصورة</TableHead>
                  <TableHead className="min-w-[200px]">المحتوى</TableHead>
                  <TableHead className="w-32 text-center">الحالة</TableHead>
                  <TableHead className="w-40 text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slides.map((s, index) => (
                  <DraggableSlideRow
                    key={s.id}
                    slide={s}
                    index={index}
                    moveRow={moveRow}
                    commitOrder={commitOrder}
                  >
                    <TableCell>
                      <div className="relative w-24 h-16 rounded-lg overflow-hidden bg-muted">
                        {s.image ? (
                          <img
                            src={s.image}
                            alt={s.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                            لا توجد صورة
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 max-w-md">
                        <div className="font-semibold text-base line-clamp-1">{s.title}</div>
                        {s.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {s.description}
                          </p>
                        )}
                        {s.showButton && s.buttonText && (
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-xs">
                              {s.buttonText}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <Switch
                          checked={s.isActive}
                          onCheckedChange={() => handleToggleActive(s)}
                          disabled={togglingId === s.id}
                        />
                        {togglingId === s.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : s.isActive ? (
                          <div className="flex items-center gap-1.5 text-green-600">
                            <Eye className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <EyeOff className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/dashboard/slides/edit/${s.id}`)}
                          className="gap-1.5"
                        >
                          <Pencil className="w-4 h-4" />
                          <span className="hidden sm:inline">تعديل</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteTarget(s)}
                          className="gap-1.5 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="hidden sm:inline">حذف</span>
                        </Button>
                      </div>
                    </TableCell>
                  </DraggableSlideRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DndProvider>

        {slides.length === 0 && (
          <EmptyState
            variant="inline"
            icon={ImageIcon}
            title="لا توجد شرائح"
            description="الشرائح تتحكم في السلايدر الظاهر على الصفحة الرئيسية للموقع. أضف أول شريحة للبدء."
            action={
              <Button onClick={() => router.push('/dashboard/slides/new')} className="gap-2 bg-brand hover:bg-brand-dark">
                <Plus className="w-4 h-4" /> إضافة شريحة
              </Button>
            }
          />
        )}
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الشريحة؟</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف الشريحة "{deleteTarget?.title}"؟ هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حذف'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}