import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SeoPanel } from '@/components/dashboard/campaigns/SeoPanel';
import { dashDir, dt } from "@/lib/dashboard/i18n";

export default async function CampaignSeoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6" dir={dashDir()}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{dt("SEO المشروع حسب اللغة")}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {dt("إدارة عنوان ووصف البحث وبيانات Open Graph لكل لغة بشكل مستقل.")}</p>
        </div>
        <Button type="button" variant="outline" asChild className="gap-2">
          <Link href={`/dashboard/campaigns/edit/${id}`}>
            <ArrowLeft className="h-4 w-4" />
            {dt("العودة لتعديل المشروع")}</Link>
        </Button>
      </div>

      <SeoPanel campaignId={id} />
    </div>
  );
}
