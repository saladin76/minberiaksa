'use client';

import { DocumentForm, emptyDocument } from '../../_components/DocumentForm';
import { REPORT_COPY } from '../_components/copy';

export default function NewReportPage() {
  return <DocumentForm mode="create" initial={emptyDocument()} copy={REPORT_COPY} />;
}
