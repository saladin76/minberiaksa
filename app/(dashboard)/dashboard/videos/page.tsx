'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Plus, Pencil, Trash2, Loader2, GripVertical, Video as VideoIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { LOCALES } from '@/lib/locales';
import { VIDEO_TYPE_LABELS } from './_components/VideoForm';

interface VideoRow {
  id: string;
  slug: string;
  type: string;
  title: string;
  youtubeId: string;
  url: string;
  thumbnail: string;
  regionKey: string;
  localeFilter: string[];
  showOnHome: boolean;
  order: number;
  isActive: boolean;
  translationCount: number;
}

const VIDEO_ROW = 'VIDEO_ROW';

function DraggableVideoRow({
  video, index, moveRow, commitOrder, children,
}: {
  video: VideoRow;
  index: number;
  moveRow: (from: number, to: number) => void;
  commitOrder: () => void;
  children: React.ReactNode;
}) {
  const [{ isDragging }, drag, preview] = useDrag({
    type: VIDEO_ROW,
    item: { index },
    /* Persist once on drop. `hover` fires for every row the pointer crosses, so
       saving there sends one transaction per tick and the responses can land
       out of order. */
    end: () => commitOrder(),
    collect: (m) => ({ isDragging: m.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: VIDEO_ROW,
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
      className={`${isDragging ? 'opacity-50' : ''} ${!video.isActive ? 'bg-muted/30' : ''} hover:bg-muted/50 transition-colors`}
    >
      <TableCell className="w-12 p-2 cursor-grab active:cursor-grabbing" ref={handleRef}>
        <GripVertical className="w-5 h-5 text-muted-foreground mx-auto" />
      </TableCell>
      {children}
    </TableRow>
  );
}

/** Which locales a video is limited to — empty means every locale. */
function LocaleScope({ localeFilter }: { localeFilter: string[] }) {
  if (localeFilter.length === 0) {
    return <span className="text-xs text-slate-500">كل اللغات</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {localeFilter.map((l) => (
        <Badge key={l} variant="outline" className="text-[10px] px-1.5 py-0">
          {LOCALES[l as keyof typeof LOCALES]?.nativeLabel ?? l}
        </Badge>
      ))}
    </div>
  );
}

const TABS = [{ value: 'ALL', label: 'الكل' },
  ...Object.entries(VIDEO_TYPE_LABELS).map(([value, label]) => ({ value, label }))];

export default function VideosPage() {
  const router = useRouter();
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ALL');
  const [deleteTarget, setDeleteTarget] = useState<VideoRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    try {
      const res = await axios.get('/api/videos/admin');
      const items = res.data?.items ?? [];
      setVideos(Array.isArray(items) ? items : []);
    } catch (e) {
      /* Surfaced rather than logged only: a failed load and "no videos yet"
         otherwise render identically and nothing says which happened. */
      console.error(e);
      toast.error(errorMessage(e, 'تعذّر تحميل الفيديوهات'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  /* Reordering writes an absolute index per row, so it can only run over one
     section at a time — dragging inside a filtered view would otherwise
     renumber rows the editor cannot see. */
  const visible = useMemo(
    () => (tab === 'ALL' ? videos : videos.filter((v) => v.type === tab)),
    [videos, tab]
  );

  const latest = useRef(visible);
  latest.current = visible;
  const orderDirty = useRef(false);

  const moveRow = useCallback((from: number, to: number) => {
    orderDirty.current = true;
    setVideos((prev) => {
      /* Splice within the visible subset, then write that subset back in place
         so rows hidden by the tab keep their positions. */
      const subset = tab === 'ALL' ? [...prev] : prev.filter((v) => v.type === tab);
      const [removed] = subset.splice(from, 1);
      subset.splice(to, 0, removed);
      if (tab === 'ALL') return subset;
      const queue = [...subset];
      return prev.map((v) => (v.type === tab ? queue.shift()! : v));
    });
  }, [tab]);

  const commitOrder = useCallback(async () => {
    if (!orderDirty.current) return;
    orderDirty.current = false;
    const payload = latest.current.map((v, i) => ({ id: v.id, order: i }));
    try {
      await axios.post('/api/videos/reorder', { videos: payload });
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر حفظ الترتيب'));
      fetchVideos();
    }
  }, [fetchVideos]);

  const toggle = async (video: VideoRow, field: 'isActive' | 'showOnHome', next: boolean) => {
    setTogglingId(video.id);
    /* Only the one flag is sent. Echoing the whole row back would let a stale
       field the list is holding overwrite good data — and omitting
       `translations` is what tells the API to leave the translation rows alone. */
    try {
      await axios.put(`/api/videos/${video.id}`, { [field]: next });
      setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, [field]: next } : v)));
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
      await axios.delete(`/api/videos/${deleteTarget.id}`);
      setVideos((prev) => prev.filter((v) => v.id !== deleteTarget.id));
      toast.success('تم حذف الفيديو');
      setDeleteTarget(null);
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر حذف الفيديو'));
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
            <h1 className="text-lg font-bold">الفيديوهات</h1>
            <p className="text-xs text-slate-500">
              إنجازاتنا وتزكياتنا ومقاطع الميدان. التزكية يمكن قصرها على لغات بعينها.
            </p>
          </div>
          <Button onClick={() => router.push('/dashboard/videos/new')}>
            <Plus className="w-4 h-4 ml-1" />
            فيديو جديد
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab} dir="rtl">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                <span className="mr-1.5 text-[10px] text-slate-400">
                  {t.value === 'ALL' ? videos.length : videos.filter((v) => v.type === t.value).length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {visible.length === 0 ? (
          <EmptyState
            icon={VideoIcon}
            title="لا توجد فيديوهات"
            description="أضف أول فيديو ليظهر في قسمه على الموقع."
            action={
              <Button onClick={() => router.push('/dashboard/videos/new')}>
                <Plus className="w-4 h-4 ml-1" />
                فيديو جديد
              </Button>
            }
          />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12" />
                  <TableHead>الفيديو</TableHead>
                  <TableHead>القسم</TableHead>
                  <TableHead>اللغات</TableHead>
                  <TableHead>الرئيسية</TableHead>
                  <TableHead>الترجمات</TableHead>
                  <TableHead>مفعّل</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((video, index) => (
                  <DraggableVideoRow
                    key={video.id}
                    video={video}
                    index={index}
                    moveRow={moveRow}
                    commitOrder={commitOrder}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {video.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={video.thumbnail} alt="" className="w-16 h-10 rounded object-cover border" />
                        ) : (
                          <div className="w-16 h-10 rounded border bg-slate-50 grid place-items-center">
                            <VideoIcon className="w-4 h-4 text-slate-400" />
                          </div>
                        )}
                        <div>
                          <div className="font-semibold">{video.title}</div>
                          <div className="text-xs text-slate-500" dir="ltr">{video.slug}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {VIDEO_TYPE_LABELS[video.type] ?? video.type}
                      {video.regionKey ? (
                        <div className="text-[10px] text-slate-400" dir="ltr">{video.regionKey}</div>
                      ) : null}
                    </TableCell>
                    <TableCell><LocaleScope localeFilter={video.localeFilter} /></TableCell>
                    <TableCell>
                      <Switch
                        checked={video.showOnHome}
                        disabled={togglingId === video.id}
                        onCheckedChange={(v) => toggle(video, 'showOnHome', v)}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{video.translationCount}</TableCell>
                    <TableCell>
                      <Switch
                        checked={video.isActive}
                        disabled={togglingId === video.id}
                        onCheckedChange={(v) => toggle(video, 'isActive', v)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/dashboard/videos/edit/${video.id}`)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(video)}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </DraggableVideoRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>حذف الفيديو</AlertDialogTitle>
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
