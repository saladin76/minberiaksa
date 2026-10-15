import { ArchiveProjectOptionsSettings } from "../_components/ArchiveProjectOptionsSettings";
import { dt } from "@/lib/dashboard/i18n";

export const metadata = { get title() { return dt("إعدادات الأرشيف | لوحة التحكم"); } };
export const dynamic = "force-dynamic";

export default function ArchiveSettingsPage() {
  return <ArchiveProjectOptionsSettings />;
}
