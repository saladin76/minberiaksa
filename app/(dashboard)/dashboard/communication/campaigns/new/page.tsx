import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Megaphone } from "lucide-react";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { NewCampaignWizard } from "./_components/NewCampaignWizard";
import { UpdateCampaignWizard } from "./_components/UpdateCampaignWizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "حملة جديدة | التواصل" };

/**
 * `?updateId=<Update id>` opens the campaign-update variant: an email to every
 * donor of that project, built from the update (sent from the campaign's
 * "إنجازات المشروع" section in the dashboard).
 */
export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ updateId?: string }> }) {
  const access = resolveDashboardPageAccess(await getServerSession(authOptions), "messages");
  if (!access.allowed) redirect(access.redirectTo);
  const { updateId } = await searchParams;
  const fromUpdate = typeof updateId === "string" && /^[0-9a-fA-F]{24}$/.test(updateId) ? updateId : null;

  return (
    <div className="min-h-0" dir="rtl">
      <div className="mx-auto max-w-[1100px]">
        <PageHeader
          eyebrow="الحملات التسويقية"
          title={fromUpdate ? "حملة بريد من تحديث المشروع" : "حملة جديدة"}
          description={
            fromUpdate
              ? "أرسل هذا التحديث لكل من تبرّع للمشروع ليرى أثر عطائه  كل متبرع يستلمه بلغته المفضّلة."
              : "اختر القناة، ثم القالب، ثم المتبرعين  كل متبرع يستلم القالب بلغته المفضّلة."
          }
          icon={Megaphone}
        />
        {fromUpdate ? <UpdateCampaignWizard updateId={fromUpdate} /> : <NewCampaignWizard />}
      </div>
    </div>
  );
}
