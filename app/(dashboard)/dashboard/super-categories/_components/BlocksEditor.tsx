'use client';

import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ContentTranslationTabs,
  emptyTranslations,
  type TranslationField,
  type TranslationMap,
} from '../../_components/ContentTranslationTabs';
import { ImageUploadField } from '../../_components/ImageUploadField';
import type { ContentOption } from './ContentPicker';

/**
 * The ordered sections of a super category's page.
 *
 * Each block declares a kind, and the kind decides which fields are worth
 * showing: a grid of linked campaigns needs a heading and a cap, a press panel
 * needs a body and a link, a film needs a YouTube id. Rendering every field for
 * every kind would put ten empty inputs in front of an editor adding a video,
 * so the form asks only for what that kind uses.
 */

export const BLOCK_KIND_LABELS: Record<string, string> = {
  CAMPAIGNS: 'المشاريع المرتبطة',
  POSTS: 'المقالات المرتبطة',
  VIDEOS: 'الفيديوهات المرتبطة',
  PLAYLISTS: 'البرامج المرتبطة',
  COURSES: 'الدورات المرتبطة',
  REPORTS: 'التقارير المرتبطة',
  BOOKLETS: 'الكتيبات المرتبطة',
  TEXT: 'لوحة نصية (خبر، تعريف…)',
  VIDEO: 'فيديو مفرد',
  PLAYLIST_EPISODES: 'حلقات سلسلة',
};

/** Which optional inputs each kind actually uses. */
const FIELDS: Record<string, { heading: boolean; body: boolean; link: boolean; video: boolean; playlist: boolean; max: boolean; image: boolean }> = {
  CAMPAIGNS: { heading: true, body: false, link: false, video: false, playlist: false, max: true, image: false },
  POSTS: { heading: true, body: false, link: false, video: false, playlist: false, max: true, image: false },
  VIDEOS: { heading: true, body: false, link: false, video: false, playlist: false, max: true, image: false },
  PLAYLISTS: { heading: true, body: false, link: false, video: false, playlist: false, max: true, image: false },
  COURSES: { heading: true, body: false, link: false, video: false, playlist: false, max: true, image: false },
  REPORTS: { heading: true, body: false, link: false, video: false, playlist: false, max: true, image: false },
  BOOKLETS: { heading: true, body: false, link: false, video: false, playlist: false, max: true, image: false },
  TEXT: { heading: true, body: true, link: true, video: false, playlist: false, max: false, image: true },
  VIDEO: { heading: true, body: false, link: false, video: true, playlist: false, max: false, image: false },
  PLAYLIST_EPISODES: { heading: true, body: false, link: true, video: false, playlist: true, max: false, image: false },
};

export const BLOCK_TRANSLATION_FIELDS: readonly TranslationField[] = [
  { name: 'eyebrow', label: 'السطر العلوي' },
  { name: 'title', label: 'العنوان' },
  { name: 'subtitle', label: 'العنوان الفرعي' },
  { name: 'body', label: 'النص', multiline: true },
  { name: 'linkLabel', label: 'نص الرابط' },
];

export interface BlockRow {
  kind: string;
  anchor: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  body: string;
  linkLabel: string;
  linkUrl: string;
  image: string;
  youtubeId: string;
  refId: string;
  maxItems: string;
  isActive: boolean;
  translations: TranslationMap;
}

export function emptyBlock(kind = 'TEXT'): BlockRow {
  return {
    kind,
    anchor: '',
    eyebrow: '',
    title: '',
    subtitle: '',
    body: '',
    linkLabel: '',
    linkUrl: '',
    image: '',
    youtubeId: '',
    refId: '',
    maxItems: '',
    isActive: true,
    translations: emptyTranslations(BLOCK_TRANSLATION_FIELDS),
  };
}

export function BlocksEditor({
  rows,
  onChange,
  playlists,
}: {
  rows: BlockRow[];
  onChange: (next: BlockRow[]) => void;
  playlists: ContentOption[];
}) {
  const set = (index: number, patch: Partial<BlockRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {rows.map((row, index) => {
        const fields = FIELDS[row.kind] ?? FIELDS.TEXT;
        return (
          <div key={index} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{index + 1}</Badge>
              <div className="min-w-[200px] flex-1">
                <Select value={row.kind} onValueChange={(v) => set(index, { kind: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(BLOCK_KIND_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-1.5">
                <Switch checked={row.isActive} onCheckedChange={(v) => set(index, { isActive: v })} />
                <span className="text-[11px]">ظاهر</span>
              </label>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(index, -1)} aria-label="أعلى">
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(index, 1)} aria-label="أسفل">
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
                aria-label="حذف"
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {fields.heading ? (
                <>
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-600">السطر العلوي</span>
                    <Input className="h-8 text-xs" value={row.eyebrow} onChange={(e) => set(index, { eyebrow: e.target.value })} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-600">العنوان</span>
                    <Input className="h-8 text-xs" value={row.title} onChange={(e) => set(index, { title: e.target.value })} />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-[11px] font-semibold text-slate-600">العنوان الفرعي</span>
                    <Input className="h-8 text-xs" value={row.subtitle} onChange={(e) => set(index, { subtitle: e.target.value })} />
                  </label>
                </>
              ) : null}

              {fields.body ? (
                <label className="space-y-1 md:col-span-2">
                  <span className="text-[11px] font-semibold text-slate-600">النص</span>
                  <Textarea rows={4} className="text-xs" value={row.body} onChange={(e) => set(index, { body: e.target.value })} />
                </label>
              ) : null}

              {fields.link ? (
                <>
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-600">نص الرابط</span>
                    <Input className="h-8 text-xs" value={row.linkLabel} onChange={(e) => set(index, { linkLabel: e.target.value })} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-600">الرابط</span>
                    <Input dir="ltr" className="h-8 text-xs" placeholder="https://…" value={row.linkUrl} onChange={(e) => set(index, { linkUrl: e.target.value })} />
                  </label>
                </>
              ) : null}

              {fields.video ? (
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600">فيديو يوتيوب (رابط أو معرّف)</span>
                  <Input dir="ltr" className="h-8 text-xs" value={row.youtubeId} onChange={(e) => set(index, { youtubeId: e.target.value })} />
                </label>
              ) : null}

              {fields.playlist ? (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600">السلسلة</span>
                  <Select value={row.refId || 'none'} onValueChange={(v) => set(index, { refId: v === 'none' ? '' : v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر سلسلة" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {playlists.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {fields.max ? (
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600">أقصى عدد معروض (فارغ = الكل)</span>
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    className="h-8 text-xs"
                    value={row.maxItems}
                    onChange={(e) => set(index, { maxItems: e.target.value.replace(/[^0-9]/g, '') })}
                  />
                </label>
              ) : null}

              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">مُعرّف الارتساء (anchor)</span>
                <Input
                  dir="ltr"
                  className="h-8 text-xs"
                  placeholder="bundle"
                  value={row.anchor}
                  onChange={(e) => set(index, { anchor: e.target.value })}
                />
              </label>

              {fields.image ? (
                <div className="md:col-span-2">
                  <ImageUploadField
                    label="صورة"
                    value={row.image}
                    onChange={(url) => set(index, { image: url })}
                    previewClass="w-40 h-24"
                  />
                </div>
              ) : null}
            </div>

            <details className="rounded border bg-slate-50/60 p-2">
              <summary className="cursor-pointer text-[11px] font-bold text-slate-600">ترجمات هذا القسم</summary>
              <div className="pt-2">
                <ContentTranslationTabs
                  fields={BLOCK_TRANSLATION_FIELDS}
                  requiredField="title"
                  value={row.translations}
                  onChange={(next) => set(index, { translations: next })}
                />
              </div>
            </details>
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, emptyBlock()])}>
        <Plus className="ml-1 h-4 w-4" />
        إضافة قسم
      </Button>
    </div>
  );
}
