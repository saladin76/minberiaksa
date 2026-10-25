import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { DonorCommunicationHistory } from "@/components/dashboard/DonorCommunicationHistory";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireDashboardPagePermission("messages");
  return <DonorCommunicationHistory userId={(await params).id} />;
}
