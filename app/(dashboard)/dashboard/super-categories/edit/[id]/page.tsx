'use client';

import { use, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { translationsFromRows } from '../../../_components/ContentTranslationTabs';
import {
  SuperCategoryForm,
  SUPER_CATEGORY_TRANSLATION_FIELDS,
  ITEM_KINDS,
  emptySuperCategory,
  type ItemsMap,
  type SuperCategoryFormValues,
} from '../../_components/SuperCategoryForm';
import { BLOCK_TRANSLATION_FIELDS, emptyBlock, type BlockRow } from '../../_components/BlocksEditor';

type ApiItem = { kind: string; refId: string; order: number };
type ApiBlock = {
  kind: string;
  anchor: string | null;
  eyebrow: string | null;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  image: string | null;
  youtubeId: string | null;
  refId: string | null;
  maxItems: number | null;
  isActive: boolean;
  translations: Array<Record<string, unknown>>;
};

export default function EditSuperCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [initial, setInitial] = useState<SuperCategoryFormValues | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    axios
      .get(`/api/super-categories/${id}`)
      .then((res) => {
        if (!live) return;
        const row = res.data;

        /* Items come back flat and ordered; the form edits them per kind. */
        const items: ItemsMap = Object.fromEntries(ITEM_KINDS.map((k) => [k.kind, [] as string[]]));
        for (const item of (row.items ?? []) as ApiItem[]) {
          if (items[item.kind]) items[item.kind].push(item.refId);
        }

        setInitial({
          ...emptySuperCategory(),
          slug: row.slug ?? '',
          title: row.title ?? '',
          subtitle: row.subtitle ?? '',
          intro: row.intro ?? '',
          verseArabic: row.verseArabic ?? '',
          verseTranslation: row.verseTranslation ?? '',
          verseAttribution: row.verseAttribution ?? '',
          heroImage: row.heroImage ?? '',
          logoImage: row.logoImage ?? '',
          accentColor: row.accentColor ?? '#7C2318',
          heroVideoId: row.heroVideoId ?? '',
          heroVideoLocales: Array.isArray(row.heroVideoLocales) ? row.heroVideoLocales : [],
          ctaPrimaryLabel: row.ctaPrimaryLabel ?? '',
          ctaPrimaryHref: row.ctaPrimaryHref ?? '',
          ctaSecondaryLabel: row.ctaSecondaryLabel ?? '',
          ctaSecondaryHref: row.ctaSecondaryHref ?? '',
          ctaTertiaryLabel: row.ctaTertiaryLabel ?? '',
          ctaTertiaryHref: row.ctaTertiaryHref ?? '',
          metaTitle: row.metaTitle ?? '',
          metaDescription: row.metaDescription ?? '',
          isActive: row.isActive !== false,
          translations: translationsFromRows(row.translations ?? [], SUPER_CATEGORY_TRANSLATION_FIELDS),
          items,
          blocks: ((row.blocks ?? []) as ApiBlock[]).map<BlockRow>((b) => ({
            ...emptyBlock(b.kind),
            kind: b.kind,
            anchor: b.anchor ?? '',
            eyebrow: b.eyebrow ?? '',
            title: b.title ?? '',
            subtitle: b.subtitle ?? '',
            body: b.body ?? '',
            linkLabel: b.linkLabel ?? '',
            linkUrl: b.linkUrl ?? '',
            image: b.image ?? '',
            youtubeId: b.youtubeId ?? '',
            refId: b.refId ?? '',
            maxItems: b.maxItems == null ? '' : String(b.maxItems),
            isActive: b.isActive !== false,
            translations: translationsFromRows(b.translations ?? [], BLOCK_TRANSLATION_FIELDS),
          })),
        });
      })
      .catch((e) => {
        if (!live) return;
        setMissing(true);
        toast.error(errorMessage(e, 'تعذّر تحميل القسم'));
      });
    return () => {
      live = false;
    };
  }, [id]);

  if (missing) {
    return <p className="py-24 text-center text-sm text-slate-500">القسم غير موجود.</p>;
  }

  if (!initial) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <SuperCategoryForm key={id} mode="edit" superCategoryId={id} initial={initial} />;
}
