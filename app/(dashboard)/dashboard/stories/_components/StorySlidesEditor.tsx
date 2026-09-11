'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowDown, ArrowUp, Languages, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { STORY_PAGE_TARGETS } from '@/lib/content/story-cta';
import { ImageUploadField } from '../../_components/ImageUploadField';
import {
  ContentTranslationTabs,
  emptyTranslations,
  filledLocaleCount,
  type TranslationField,
  type TranslationMap,
} from '../../_components/ContentTranslationTabs';

/**
 * The slides inside one story — what a visitor sees full-screen after tapping
 * the ring. Each slide is an image (with a dwell time) or a video (runs to its
 * end), an optional caption, and an optional button.
 *
 * The button is stored as a KIND and a VALUE, not an href. An editor picks
 * "the zakat page", "this campaign", "this article" or types a URL; the public
 * API turns that into the right link for each visitor's language at request
 * time (`lib/content/story-cta.ts`). Currency follows the visitor's cookie
 * regardless of link, so nothing here needs to know about it.
 *
 * The list is form state, posted whole; the API replaces the stored slides
 * with exactly this. Reordering is up/down rather than drag — a story has a
 * handful of slides and two buttons are more predictable inside a long form.
 */

export const SLIDE_TRANSLATION_FIELDS: readonly TranslationField[] = [
  { name: 'caption', label: 'النص', multiline: true },
  { name: 'ctaLabel', label: 'نص الزر' },
];

/** Radix Select refuses an empty-string item value, so "none" is a sentinel. */
const NO_CTA = '__none__';

export const CTA_KIND_LABELS: Record<string, string> = {
  PAGE: 'صفحة في الموقع',
  CAMPAIGN: 'مشروع',
  POST: 'مقال',
  URL: 'رابط',
};

export interface SlideRow {
  /** Present on rows loaded from the API, absent on new ones. Not posted. */
  id?: string;
  mediaType: 'IMAGE' | 'VIDEO';
  mediaUrl: string;
  durationSeconds: string;
  caption: string;
  ctaLabel: string;
  ctaKind: string;
  ctaValue: string;
  translations: TranslationMap;
}

export function emptySlide(): SlideRow {
  return {
    mediaType: 'IMAGE',
    mediaUrl: '',
    durationSeconds: '5',
    caption: '',
    ctaLabel: '',
    ctaKind: '',
    ctaValue: '',
    translations: emptyTranslations(SLIDE_TRANSLATION_FIELDS),
  };
}

type Option = { id: string; title: string };

/**
 * Campaigns and posts for the target pickers. Loaded once per editor mount,
 * and only when a slide actually asks for that kind — a story of plain images
 * should not cost two list requests.
 */
function useTargetOptions(need: { campaigns: boolean; posts: boolean }) {
  const [campaigns, setCampaigns] = useState<Option[] | null>(null);
  const [posts, setPosts] = useState<Option[] | null>(null);

  useEffect(() => {
    if (!need.campaigns || campaigns !== null) return;
    let live = true;
    (async () => {
      const out: Option[] = [];
      /* The list API pages at 100; three pages covers this site with room. */
      for (let page = 1; page <= 3; page++) {
        try {
          const res = await axios.get('/api/campaigns', { params: { limit: 100, page, includeInactive: true } });
          out.push(...((res.data?.items ?? []) as Option[]).map((c) => ({ id: c.id, title: c.title })));
          if (!res.data?.hasMore) break;
        } catch { break; }
      }
      if (live) setCampaigns(out);
    })();
    return () => { live = false; };
  }, [need.campaigns, campaigns]);

  useEffect(() => {
    if (!need.posts || posts !== null) return;
    let live = true;
    axios
      .get('/api/posts', { params: { limit: 1000 } })
      .then((res) => { if (live) setPosts(((res.data?.items ?? []) as Option[]).map((p) => ({ id: p.id, title: p.title }))); })
      .catch(() => { if (live) setPosts([]); });
    return () => { live = false; };
  }, [need.posts, posts]);

  return { campaigns: campaigns ?? [], posts: posts ?? [], loadingCampaigns: need.campaigns && campaigns === null, loadingPosts: need.posts && posts === null };
}

export function StorySlidesEditor({
  rows,
  onChange,
}: {
  rows: SlideRow[];
  onChange: (next: SlideRow[]) => void;
}) {
  const [openTranslations, setOpenTranslations] = useState<Record<number, boolean>>({});
  const options = useTargetOptions({
    campaigns: rows.some((r) => r.ctaKind === 'CAMPAIGN'),
    posts: rows.some((r) => r.ctaKind === 'POST'),
  });

  const update = (i: number, patch: Partial<SlideRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  const swap = (i: number, j: number) => {
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  /* Changing the kind clears the value: a campaign id is meaningless as a
     page key, and a stale value would post a CTA the API silently drops. */
  const setKind = (i: number, kind: string) =>
    update(i, { ctaKind: kind === NO_CTA ? '' : kind, ctaValue: '' });

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">لا توجد شرائح بعد. القصة تحتاج شريحة واحدة على الأقل.</p>
      ) : null}

      {rows.map((row, i) => {
        const translated = filledLocaleCount(row.translations, 'caption') + 0;
        return (
          <div key={row.id ?? `new-${i}`} className="rounded-lg border p-3 space-y-3 bg-slate-50/50">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">شريحة #{i + 1}</span>
              <div className="flex items-center gap-1">
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

            <div className="grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)_8rem]">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">النوع</span>
                <Select value={row.mediaType} onValueChange={(v) => update(i, { mediaType: v as SlideRow['mediaType'], mediaUrl: '' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IMAGE">صورة</SelectItem>
                    <SelectItem value="VIDEO">فيديو</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {row.mediaType === 'IMAGE' ? (
                <ImageUploadField
                  label="الصورة"
                  required
                  value={row.mediaUrl}
                  onChange={(url) => update(i, { mediaUrl: url })}
                  previewClass="w-24 h-40"
                />
              ) : (
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600">رابط الفيديو (mp4) *</span>
                  <Input dir="ltr" placeholder="https://…/clip.mp4" value={row.mediaUrl} onChange={(e) => update(i, { mediaUrl: e.target.value })} />
                  <span className="block text-[11px] text-slate-500">يُعرض حتى نهايته؛ الأفضل أن يكون عموديًا وقصيرًا.</span>
                </label>
              )}

              {row.mediaType === 'IMAGE' ? (
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600">المدة (ثانية)</span>
                  <Input dir="ltr" type="number" min={1} max={60} value={row.durationSeconds} onChange={(e) => update(i, { durationSeconds: e.target.value })} />
                </label>
              ) : <div />}
            </div>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-slate-600">النص (بالعربية)</span>
              <Textarea rows={2} value={row.caption} onChange={(e) => update(i, { caption: e.target.value })} />
            </label>

            <div className="rounded-md border bg-white p-3 space-y-2">
              <p className="text-[11px] font-semibold text-slate-600">زر الانتقال</p>
              <div className="grid gap-2 md:grid-cols-[10rem_minmax(0,1fr)]">
                <Select value={row.ctaKind || NO_CTA} onValueChange={(v) => setKind(i, v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CTA}>— بدون زر —</SelectItem>
                    {Object.entries(CTA_KIND_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {row.ctaKind === 'PAGE' ? (
                  <Select value={row.ctaValue || undefined} onValueChange={(v) => update(i, { ctaValue: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر صفحة" /></SelectTrigger>
                    <SelectContent>
                      {STORY_PAGE_TARGETS.map((p) => (
                        <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : row.ctaKind === 'CAMPAIGN' ? (
                  <Select value={row.ctaValue || undefined} onValueChange={(v) => update(i, { ctaValue: v })}>
                    <SelectTrigger><SelectValue placeholder={options.loadingCampaigns ? 'جارٍ التحميل…' : 'اختر مشروعًا'} /></SelectTrigger>
                    <SelectContent>
                      {options.campaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : row.ctaKind === 'POST' ? (
                  <Select value={row.ctaValue || undefined} onValueChange={(v) => update(i, { ctaValue: v })}>
                    <SelectTrigger><SelectValue placeholder={options.loadingPosts ? 'جارٍ التحميل…' : 'اختر مقالًا'} /></SelectTrigger>
                    <SelectContent>
                      {options.posts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : row.ctaKind === 'URL' ? (
                  <Input dir="ltr" placeholder="/projects#gaza أو https://…" value={row.ctaValue} onChange={(e) => update(i, { ctaValue: e.target.value })} />
                ) : (
                  <div className="text-xs text-slate-400 self-center">الزر ينقل الزائر بلغته الحالية تلقائيًا.</div>
                )}
              </div>
              {row.ctaKind ? (
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600">نص الزر (بالعربية)</span>
                  <Input placeholder="تبرّع الآن" value={row.ctaLabel} onChange={(e) => update(i, { ctaLabel: e.target.value })} />
                  <span className="block text-[11px] text-slate-500">
                    {row.ctaKind === 'URL'
                      ? 'رابط داخلي مثل /projects#gaza يُحوَّل تلقائيًا إلى لغة الزائر؛ الروابط الخارجية تبقى كما هي.'
                      : 'يُحلّ الرابط لكل زائر بلغته: المشروع بمعرّفه المترجم، والصفحة بمسارها المحلي.'}
                  </span>
                </label>
              ) : null}
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setOpenTranslations((p) => ({ ...p, [i]: !p[i] }))}
              >
                <Languages className="w-3.5 h-3.5 ml-1" />
                ترجمات النص والزر
                <span className="mr-1.5 text-[10px] text-slate-400">{translated} لغة</span>
              </Button>
              {openTranslations[i] ? (
                <ContentTranslationTabs
                  fields={SLIDE_TRANSLATION_FIELDS}
                  requiredField="caption"
                  value={row.translations}
                  onChange={(next) => update(i, { translations: next })}
                />
              ) : null}
            </div>
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, emptySlide()])}>
        <Plus className="w-4 h-4 ml-1" />
        إضافة شريحة
      </Button>
    </div>
  );
}
