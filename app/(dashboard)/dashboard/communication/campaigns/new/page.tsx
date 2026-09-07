import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Megaphone } from "lucide-react";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { NewCampaignWizard } from "./_components/NewCampaignWizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "حملة جديدة | التواصل" };

export default async function NewCampaignPage() {
  const access = resolveDashboardPageAccess(await getServerSession(authOptions), "messages");
  if (!access.allowed) redirect(access.redirectTo);

  return (
    <div className="min-h-0" dir="rtl">
      <div className="mx-auto max-w-[1100px]">
        <PageHeader
          eyebrow="الحملات التسويقية"
          title="حملة جديدة"
          description="اختر القناة، ثم القالب، ثم المتبرعين — كل متبرع يستلم القالب بلغته المفضّلة."
          icon={Megaphone}
        />
        <NewCampaignWizard />
      </div>
    </div>
  );
}
