'use client';

import { use, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { translationsFromRows } from '../../../_components/ContentTranslationTabs';
import {
  StoryForm,
  STORY_TRANSLATION_FIELDS,
  emptyStory,
  type StoryFormValues,
} from '../../_components/StoryForm';

export default function EditStoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [initial, setInitial] = useState<StoryFormValues | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    axios
      .get(`/api/stories/${id}`)
      .then((res) => {
        if (!live) return;
        const s = res.data;
        setInitial({
          ...emptyStory(),
          slug: s.slug ?? '',
          title: s.title ?? '',
          image: s.image ?? '',
          linkUrl: s.linkUrl ?? '',
          isActive: s.isActive !== false,
          startsAt: s.startsAt ?? '',
          endsAt: s.endsAt ?? '',
          translations: translationsFromRows(s.translations ?? [], STORY_TRANSLATION_FIELDS),
        });
      })
      .catch((e) => {
        if (!live) return;
        setMissing(true);
        toast.error(errorMessage(e, 'تعذّر تحميل القصة'));
      });
    return () => {
      live = false;
    };
  }, [id]);

  if (missing) {
    return <p className="py-24 text-center text-sm text-slate-500">القصة غير موجودة.</p>;
  }

  if (!initial) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* Keyed on the id so navigating between two stories remounts the form with
     the new row instead of keeping the previous one's edits in state. */
  return <StoryForm key={id} mode="edit" storyId={id} initial={initial} />;
}
