'use client';

import { DocumentForm, emptyDocument } from '../../_components/DocumentForm';
import { BOOKLET_COPY } from '../_components/copy';

export default function NewBookletPage() {
  return <DocumentForm mode="create" initial={emptyDocument()} copy={BOOKLET_COPY} />;
}
