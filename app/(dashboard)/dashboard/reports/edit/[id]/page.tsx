'use client';

import { use } from 'react';
import { DocumentEditPage } from '../../../_components/DocumentEditPage';
import { REPORT_COPY } from '../../_components/copy';

export default function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DocumentEditPage id={id} copy={REPORT_COPY} />;
}
