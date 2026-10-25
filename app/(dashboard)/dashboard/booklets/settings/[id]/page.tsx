'use client';

import { use } from 'react';
import { DocumentEditPage } from '../../../_components/DocumentEditPage';
import { BOOKLET_COPY } from '../../_components/copy';

export default function EditBookletPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DocumentEditPage id={id} copy={BOOKLET_COPY} />;
}
