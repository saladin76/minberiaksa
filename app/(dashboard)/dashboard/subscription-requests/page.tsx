"use client";
import { useSearchParams } from "next/navigation";
import { ListChecks } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SubscriptionRequestsPanel } from "@/components/dashboard/SubscriptionRequestsPanel";
import { dashDir, dt } from "@/lib/dashboard/i18n";

export default function DonationRequestsPage() {
  const params = useSearchParams();
  return <main dir={dashDir()} className="mx-auto w-full max-w-6xl space-y-6 p-3 sm:p-6 lg:p-8">
    <PageHeader icon={ListChecks} title={dt("طلبات إدارة التبرع")} description={dt("متابعة طلبات المتبرعين لتعديل التبرعات الدورية أو إيقافها، مع سجل واضح لكل إجراء.")} />
    <SubscriptionRequestsPanel donorId={params.get("userId") || undefined} selectedRequestId={params.get("requestId") || undefined} selectedSubscriptionId={params.get("subscriptionId") || undefined} />
  </main>;
}
