'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { translationsFromRows } from './ContentTranslationTabs';
import {
  DocumentForm,
  DOCUMENT_TRANSLATION_FIELDS,
  emptyDocument,
  type DocumentFormValues,
  type DocumentSectionCopy,
} from './DocumentForm';

/** Shared edit screen for the two document sections, reports and booklets. */
export function DocumentEditPage({ id, copy }: { id: string; copy: DocumentSectionCopy }) {
  const [initial, setInitial] = useState<DocumentFormValues | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    axios
      .get(`${copy.endpoint}/${id}`)
      .then((res) => {
        if (!live) return;
        const d = res.data;
        setInitial({
          ...emptyDocument(),
          slug: d.slug ?? '',
          title: d.title ?? '',
          description: d.description ?? '',
          fileUrl: d.fileUrl ?? '',
          coverImage: d.coverImage ?? '',
          year: d.year == null ? '' : String(d.year),
          isPublished: d.isPublished !== false,
          translations: translationsFromRows(d.translations ?? [], DOCUMENT_TRANSLATION_FIELDS),
        });
      })
      .catch((e) => {
        if (!live) return;
        setMissing(true);
        toast.error(errorMessage(e, `تعذّر تحميل ${copy.singular}`));
      });
    return () => {
      live = false;
    };
  }, [id, copy.endpoint, copy.singular]);

  if (missing) {
    return <p className="py-24 text-center text-sm text-slate-500">{copy.singular} غير موجود.</p>;
  }

  if (!initial) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* Keyed on the id so navigating between two rows remounts the form with the
     new one instead of keeping the previous row's edits in state. */
  return <DocumentForm key={id} mode="edit" documentId={id} initial={initial} copy={copy} />;
}
