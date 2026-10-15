import type { DocumentSectionCopy } from '../../_components/DocumentForm';
import { dt } from "@/lib/dashboard/i18n";

export const REPORT_COPY: DocumentSectionCopy = {
  get section() { return dt("التقارير"); },
  get singular() { return dt("التقرير"); },
  endpoint: '/api/reports',
  basePath: '/dashboard/reports',
  showYear: true,
};
