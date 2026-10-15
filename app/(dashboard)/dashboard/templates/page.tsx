import TemplatesPageClient from "./_components/TemplatesPageClient";
import { dt } from "@/lib/dashboard/i18n";

export const metadata = {
  get title() { return dt("القوالب | لوحة التحكم"); },
};

export default function TemplatesPage() {
  return <TemplatesPageClient />;
}
