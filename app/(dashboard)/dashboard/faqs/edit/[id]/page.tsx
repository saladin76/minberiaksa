'use client';

import { use, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { translationsFromRows } from '../../../_components/ContentTranslationTabs';
import {
  FaqForm,
  FAQ_TRANSLATION_FIELDS,
  emptyFaq,
  type FaqFormValues,
} from '../../_components/FaqForm';

export default function EditFaqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [initial, setInitial] = useState<FaqFormValues | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    axios
      .get(`/api/faqs/${id}`)
      .then((res) => {
        if (!live) return;
        const f = res.data;
        setInitial({
          ...emptyFaq(),
          question: f.question ?? '',
          answer: f.answer ?? '',
          page: f.page ?? '',
          isActive: f.isActive !== false,
          translations: translationsFromRows(f.translations ?? [], FAQ_TRANSLATION_FIELDS),
        });
      })
      .catch((e) => {
        if (!live) return;
        setMissing(true);
        toast.error(errorMessage(e, 'تعذّر تحميل السؤال'));
      });
    return () => {
      live = false;
    };
  }, [id]);

  if (missing) {
    return <p className="py-24 text-center text-sm text-slate-500">السؤال غير موجود.</p>;
  }

  if (!initial) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* Keyed on the id so navigating between two entries remounts the form. */
  return <FaqForm key={id} mode="edit" faqId={id} initial={initial} />;
}
