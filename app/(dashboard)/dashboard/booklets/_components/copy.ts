import type { DocumentSectionCopy } from '../../_components/DocumentForm';
import { dt } from "@/lib/dashboard/i18n";

export const BOOKLET_COPY: DocumentSectionCopy = {
  get section() { return dt("الكتيبات"); },
  get singular() { return dt("الكتيب"); },
  endpoint: '/api/booklets',
  basePath: '/dashboard/booklets',
  showYear: false,
};
