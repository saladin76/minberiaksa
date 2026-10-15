'use client';

import { DocumentListPage } from '../_components/DocumentListPage';
import { REPORT_COPY } from './_components/copy';
import { dt } from "@/lib/dashboard/i18n";

export default function ReportsPage() {
  return (
    <DocumentListPage
      copy={REPORT_COPY}
      reorderKey="reports"
      description={dt("التقارير السنوية وتقارير المشاريع المنشورة على الموقع.")}
      emptyDescription={dt("أضف أول تقرير ليظهر في صفحة التقارير.")}
    />
  );
}
