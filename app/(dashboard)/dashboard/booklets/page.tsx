'use client';

import { DocumentListPage } from '../_components/DocumentListPage';
import { BOOKLET_COPY } from './_components/copy';
import { dt } from "@/lib/dashboard/i18n";

export default function BookletsPage() {
  return (
    <DocumentListPage
      copy={BOOKLET_COPY}
      reorderKey="booklets"
      description={dt("كتيبات المؤسسة المتاحة للتحميل من الموقع.")}
      emptyDescription={dt("أضف أول كتيب ليظهر في صفحة الكتيبات.")}
    />
  );
}
