'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

/**
 * Inline editor for a list of YouTube videos owned by a parent — playlist
 * episodes and course videos.
 *
 * The list is form state, not a separate resource: the parent form posts it
 * whole and the API replaces it. So there is no per-row save, and reordering
 * is plain up/down rather than drag — a course has a handful of videos, and
 * two buttons are more predictable than a drag inside a scrolling form.
 *
 * Pasting a full YouTube URL into the id field extracts the id; typing the
 * eleven characters directly works too. The URL column fills itself from the
 * id when left blank, mirroring what the API does on save.
 */

export interface YoutubeRow {
  /** Present on rows loaded from the API, absent on new ones. Not posted. */
  id?: string;
  youtubeId: string;
  url: string;
  thumbnail: string;
  title: string;
  durationSeconds: string;
  isActive: boolean;
}

export function emptyYoutubeRow(): YoutubeRow {
  return { youtubeId: '', url: '', thumbnail: '', title: '', durationSeconds: '', isActive: true };
}

/** Pulls the video id out of any of the usual YouTube URL shapes. */
export function extractYoutubeId(input: string): string {
  const s = input.trim();
  if (!s) return '';
  if (/^[\w-]{11}$/.test(s)) return s;
  const m =
    s.match(/[?&]v=([\w-]{11})/) ||
    s.match(/youtu\.be\/([\w-]{11})/) ||
    s.match(/\/(?:embed|shorts|live)\/([\w-]{11})/);
  return m ? m[1] : s;
}

export function YoutubeRowsEditor({
  rows,
  onChange,
  showDuration,
  showActive,
  addLabel,
}: {
  rows: YoutubeRow[];
  onChange: (next: YoutubeRow[]) => void;
  showDuration: boolean;
  showActive: boolean;
  addLabel: string;
}) {
  const update = (i: number, patch: Partial<YoutubeRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  const swap = (i: number, j: number) => {
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const setId = (i: number, raw: string) => {
    const youtubeId = extractYoutubeId(raw);
    const row = rows[i];
    update(i, {
      youtubeId,
      /* Only fill a URL the editor has not written themselves. */
      url: row.url && !row.url.includes(row.youtubeId) ? row.url : youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : '',
      thumbnail: row.thumbnail && !row.thumbnail.includes(row.youtubeId) ? row.thumbnail : youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : '',
    });
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">لا توجد فيديوهات بعد.</p>
      ) : null}

      {rows.map((row, i) => (
        <div key={row.id ?? `new-${i}`} className="rounded-lg border p-3 space-y-2 bg-slate-50/50">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500">#{i + 1}</span>
            <div className="flex items-center gap-1">
              {showActive ? (
                <label className="flex items-center gap-1.5 ml-2">
                  <Switch checked={row.isActive} onCheckedChange={(v) => update(i, { isActive: v })} />
                  <span className="text-xs">مفعّل</span>
                </label>
              ) : null}
              <Button type="button" variant="ghost" size="icon" onClick={() => swap(i, i - 1)} disabled={i === 0}>
                <ArrowUp className="w-4 h-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => swap(i, i + 1)} disabled={i === rows.length - 1}>
                <ArrowDown className="w-4 h-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}>
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-600">معرّف يوتيوب *</span>
              <Input
                dir="ltr"
                placeholder="الصق الرابط أو المعرّف"
                value={row.youtubeId}
                onChange={(e) => setId(i, e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-600">العنوان</span>
              <Input value={row.title} onChange={(e) => update(i, { title: e.target.value })} />
            </label>
          </div>

          <div className={`grid gap-2 ${showDuration ? 'md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)]' : 'md:grid-cols-2'}`}>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-600">الرابط</span>
              <Input dir="ltr" value={row.url} onChange={(e) => update(i, { url: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-600">الصورة المصغّرة</span>
              <Input dir="ltr" value={row.thumbnail} onChange={(e) => update(i, { thumbnail: e.target.value })} />
            </label>
            {showDuration ? (
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">المدة (ثانية)</span>
                <Input
                  dir="ltr"
                  type="number"
                  min={0}
                  value={row.durationSeconds}
                  onChange={(e) => update(i, { durationSeconds: e.target.value })}
                />
              </label>
            ) : null}
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, emptyYoutubeRow()])}>
        <Plus className="w-4 h-4 ml-1" />
        {addLabel}
      </Button>
    </div>
  );
}
