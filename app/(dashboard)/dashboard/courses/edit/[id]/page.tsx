'use client';

import { use, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { translationsFromRows } from '../../../_components/ContentTranslationTabs';
import type { YoutubeRow } from '../../../_components/YoutubeRowsEditor';
import {
  CourseForm,
  COURSE_TRANSLATION_FIELDS,
  emptyCourse,
  type CourseFormValues,
} from '../../_components/CourseForm';

type ApiVideo = { id: string; youtubeId: string; url: string; thumbnail: string | null; title: string | null };

export default function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [initial, setInitial] = useState<CourseFormValues | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    axios
      .get(`/api/courses/${id}`)
      .then((res) => {
        if (!live) return;
        const c = res.data;
        setInitial({
          ...emptyCourse(),
          slug: c.slug ?? '',
          title: c.title ?? '',
          description: c.description ?? '',
          coverImage: c.coverImage ?? '',
          introVideoId: c.introVideoId ?? '',
          introVideoUrl: c.introVideoUrl ?? '',
          unitsCount: c.unitsCount == null ? '' : String(c.unitsCount),
          isPinned: c.isPinned === true,
          isExternal: c.isExternal === true,
          externalUrl: c.externalUrl ?? '',
          hasDetailPage: c.hasDetailPage === true,
          isActive: c.isActive !== false,
          translations: translationsFromRows(c.translations ?? [], COURSE_TRANSLATION_FIELDS),
          videos: ((c.videos ?? []) as ApiVideo[]).map<YoutubeRow>((v) => ({
            id: v.id,
            youtubeId: v.youtubeId ?? '',
            url: v.url ?? '',
            thumbnail: v.thumbnail ?? '',
            title: v.title ?? '',
            durationSeconds: '',
            isActive: true,
          })),
        });
      })
      .catch((e) => {
        if (!live) return;
        setMissing(true);
        toast.error(errorMessage(e, 'تعذّر تحميل الدورة'));
      });
    return () => {
      live = false;
    };
  }, [id]);

  if (missing) {
    return <p className="py-24 text-center text-sm text-slate-500">الدورة غير موجودة.</p>;
  }

  if (!initial) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <CourseForm key={id} mode="edit" courseId={id} initial={initial} />;
}
