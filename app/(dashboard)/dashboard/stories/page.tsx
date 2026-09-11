'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Plus, Pencil, Trash2, Loader2, GripVertical, Image as ImageIcon } from 'lucide-react';
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

interface Story {
  id: string;
  slug: string;
  title: string;
  image: string;
  slideCount: number;
  order: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  translationCount: number;
  expired: boolean;
  pending: boolean;
}

const STORY_ROW = 'STORY_ROW';

function DraggableStoryRow({
  story, index, moveRow, commitOrder, children,
}: {
  story: Story;
  index: number;
  moveRow: (from: number, to: number) => void;
  commitOrder: () => void;
  children: React.ReactNode;
}) {
  const [{ isDragging }, drag, preview] = useDrag({
    type: STORY_ROW,
    item: { index },
    /* Persist once on drop. `hover` fires for every row the pointer crosses, so
       saving there sends one transaction per tick and the responses can land
       out of order. */
    end: () => commitOrder(),
    collect: (m) => ({ isDragging: m.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: STORY_ROW,
    hover: (item: { index: number }) => {
      if (item.index === index) return;
      moveRow(item.index, index);
      item.index = index;
    },
  });

  /* react-dnd's connectors return the node they were given, while React 19's
     `Ref` callback type must return void or a cleanup function. The existing
     slides page assigns them directly and carries two type errors for it;
     wrapping so the connector's return value is discarded says the same thing
     to the DOM and type-checks. */
  const rowRef = (node: HTMLTableRowElement | null) => {
    preview(drop(node));
  };
  const handleRef = (node: HTMLTableCellElement | null) => {
    drag(node);
  };

  return (
    <TableRow
      ref={rowRef}
      className={`${isDragging ? 'opacity-50' : ''} ${!story.isActive ? 'bg-muted/30' : ''} hover:bg-muted/50 transition-colors`}
    >
      <TableCell className="w-12 p-2 cursor-grab active:cursor-grabbing" ref={handleRef}>
        <GripVertical className="w-5 h-5 text-muted-foreground mx-auto" />
      </TableCell>
      {children}
    </TableRow>
  );
}

/** Why a story is or is not on the site right now. */
function StatusBadge({ story }: { story: Story }) {
  if (!story.isActive) return <Badge variant="secondary">معطّلة</Badge>;
  if (story.expired) return <Badge variant="destructive">منتهية</Badge>;
  if (story.pending) return <Badge variant="outline">مجدولة</Badge>;
  return <Badge className="bg-emerald-600 hover:bg-emerald-600">ظاهرة</Badge>;
}

function formatWindow(story: Story): string {
  if (!story.endsAt) return 'غير محدودة';
  return new Date(story.endsAt).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' });
}

export default function StoriesPage() {
  const router = useRouter();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Story | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchStories = useCallback(async () => {
    try {
      const res = await axios.get('/api/stories/admin');
      const items = res.data?.items ?? [];
      setStories(
        Array.isArray(items)
          ? [...items].sort((a: Story, b: Story) => (a.order ?? 0) - (b.order ?? 0))
          : []
      );
    } catch (e) {
      /* Surfaced rather than logged only: a failed load and "no stories yet"
         otherwise render identically and nothing says which happened. */
      console.error(e);
      toast.error(errorMessage(e, 'تعذّر تحميل القصص'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStories(); }, [fetchStories]);

  const latest = useRef(stories);
  latest.current = stories;
  const orderDirty = useRef(false);

  const moveRow = useCallback((from: number, to: number) => {
    orderDirty.current = true;
    setStories((prev) => {
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
  }, []);

  const commitOrder = useCallback(async () => {
    if (!orderDirty.current) return;
    orderDirty.current = false;
    const payload = latest.current.map((s, i) => ({ id: s.id, order: i }));
    try {
      await axios.post('/api/stories/reorder', { stories: payload });
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر حفظ الترتيب'));
      fetchStories();
    }
  }, [fetchStories]);

  const toggleActive = async (story: Story, next: boolean) => {
    setTogglingId(story.id);
    /* Only the flag is sent. Echoing the whole row back would let a stale field
       the list is holding overwrite good data — and omitting `translations`
       is what tells the API to leave the translation rows alone. */
    try {
      await axios.put(`/api/stories/${story.id}`, { isActive: next });
      setStories((prev) => prev.map((s) => (s.id === story.id ? { ...s, isActive: next } : s)));
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
      await axios.delete(`/api/stories/${deleteTarget.id}`);
      setStories((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      toast.success('تم حذف القصة');
      setDeleteTarget(null);
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر حذف القصة'));
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
            <h1 className="text-lg font-bold">شريط القصص</h1>
            <p className="text-xs text-slate-500">
              يظهر في أعلى الصفحة الرئيسية ويُفتح كقصص إنستغرام. القصة تختفي تلقائيًا عند انتهاء مدتها.
            </p>
          </div>
          <Button onClick={() => router.push('/dashboard/stories/new')}>
            <Plus className="w-4 h-4 ml-1" />
            قصة جديدة
          </Button>
        </div>

        {stories.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="لا توجد قصص"
            description="أضف أول قصة لتظهر في أعلى الصفحة الرئيسية."
            action={
              <Button onClick={() => router.push('/dashboard/stories/new')}>
                <Plus className="w-4 h-4 ml-1" />
                قصة جديدة
              </Button>
            }
          />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12" />
                  <TableHead>الصورة</TableHead>
                  <TableHead>العنوان</TableHead>
                  <TableHead>الشرائح</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>تنتهي</TableHead>
                  <TableHead>الترجمات</TableHead>
                  <TableHead>مفعّلة</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {stories.map((story, index) => (
                  <DraggableStoryRow
                    key={story.id}
                    story={story}
                    index={index}
                    moveRow={moveRow}
                    commitOrder={commitOrder}
                  >
                    <TableCell>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={story.image} alt="" className="w-12 h-12 rounded object-cover border" />
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold">{story.title}</div>
                      <div className="text-xs text-slate-500" dir="ltr">{story.slug}</div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{story.slideCount}</TableCell>
                    <TableCell><StatusBadge story={story} /></TableCell>
                    <TableCell className="text-xs text-slate-600">{formatWindow(story)}</TableCell>
                    <TableCell className="text-xs text-slate-600">{story.translationCount}</TableCell>
                    <TableCell>
                      <Switch
                        checked={story.isActive}
                        disabled={togglingId === story.id}
                        onCheckedChange={(v) => toggleActive(story, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/dashboard/stories/edit/${story.id}`)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(story)}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </DraggableStoryRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>حذف القصة</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم حذف «{deleteTarget?.title}» بشرائحها وكل ترجماتها نهائيًا.
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
