'use client';

import { use, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { translationsFromRows } from '../../../_components/ContentTranslationTabs';
import {
  VideoForm,
  VIDEO_TRANSLATION_FIELDS,
  emptyVideo,
  type VideoFormValues,
} from '../../_components/VideoForm';

export default function EditVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [initial, setInitial] = useState<VideoFormValues | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    axios
      .get(`/api/videos/${id}`)
      .then((res) => {
        if (!live) return;
        const v = res.data;
        setInitial({
          ...emptyVideo(),
          slug: v.slug ?? '',
          type: v.type ?? 'ACHIEVEMENT',
          title: v.title ?? '',
          youtubeId: v.youtubeId ?? '',
          url: v.url ?? '',
          startSeconds: v.startSeconds == null ? '' : String(v.startSeconds),
          thumbnail: v.thumbnail ?? '',
          regionKey: v.regionKey ?? '',
          localeFilter: Array.isArray(v.localeFilter) ? v.localeFilter : [],
          showOnHome: v.showOnHome === true,
          isActive: v.isActive !== false,
          translations: translationsFromRows(v.translations ?? [], VIDEO_TRANSLATION_FIELDS),
        });
      })
      .catch((e) => {
        if (!live) return;
        setMissing(true);
        toast.error(errorMessage(e, 'تعذّر تحميل الفيديو'));
      });
    return () => {
      live = false;
    };
  }, [id]);

  if (missing) {
    return <p className="py-24 text-center text-sm text-slate-500">الفيديو غير موجود.</p>;
  }

  if (!initial) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* Keyed on the id so navigating between two videos remounts the form with the
     new row instead of keeping the previous one's edits in state. */
  return <VideoForm key={id} mode="edit" videoId={id} initial={initial} />;
}
