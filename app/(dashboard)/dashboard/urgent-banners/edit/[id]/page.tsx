'use client';

import { use, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { translationsFromRows } from '../../../_components/ContentTranslationTabs';
import {
  UrgentBannerForm,
  BANNER_TRANSLATION_FIELDS,
  emptyUrgentBanner,
  type UrgentBannerFormValues,
} from '../../_components/UrgentBannerForm';

export default function EditUrgentBannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [initial, setInitial] = useState<UrgentBannerFormValues | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    axios
      .get(`/api/urgent-banners/${id}`)
      .then((res) => {
        if (!live) return;
        const b = res.data;
        setInitial({
          ...emptyUrgentBanner(),
          slug: b.slug ?? '',
          title: b.title ?? '',
          description: b.description ?? '',
          image: b.image ?? '',
          ctaLabel: b.ctaLabel ?? '',
          ctaUrl: b.ctaUrl ?? '',
          campaignId: b.campaignId ?? '',
          suggestedAmounts: Array.isArray(b.suggestedAmounts) ? b.suggestedAmounts.join(', ') : '',
          priority: String(b.priority ?? 0),
          locales: Array.isArray(b.locales) ? b.locales : [],
          startsAt: b.startsAt ?? '',
          endsAt: b.endsAt ?? '',
          isActive: b.isActive !== false,
          translations: translationsFromRows(b.translations ?? [], BANNER_TRANSLATION_FIELDS),
        });
      })
      .catch((e) => {
        if (!live) return;
        setMissing(true);
        toast.error(errorMessage(e, 'تعذّر تحميل البانر'));
      });
    return () => {
      live = false;
    };
  }, [id]);

  if (missing) {
    return <p className="py-24 text-center text-sm text-slate-500">البانر غير موجود.</p>;
  }

  if (!initial) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <UrgentBannerForm key={id} mode="edit" bannerId={id} initial={initial} />;
}
