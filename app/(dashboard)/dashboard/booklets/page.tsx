'use client';

import { DocumentListPage } from '../_components/DocumentListPage';
import { BOOKLET_COPY } from './_components/copy';

export default function BookletsPage() {
  return (
    <DocumentListPage
      copy={BOOKLET_COPY}
      reorderKey="booklets"
      description="كتيبات المؤسسة المتاحة للتحميل من الموقع."
      emptyDescription="أضف أول كتيب ليظهر في صفحة الكتيبات."
    />
  );
}
