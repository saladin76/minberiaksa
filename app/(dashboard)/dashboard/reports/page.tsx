'use client';

import { DocumentListPage } from '../_components/DocumentListPage';
import { REPORT_COPY } from './_components/copy';

export default function ReportsPage() {
  return (
    <DocumentListPage
      copy={REPORT_COPY}
      reorderKey="reports"
      description="التقارير السنوية وتقارير المشاريع المنشورة على الموقع."
      emptyDescription="أضف أول تقرير ليظهر في صفحة التقارير."
    />
  );
}
