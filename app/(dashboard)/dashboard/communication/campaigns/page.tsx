import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Megaphone } from "lucide-react";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CampaignsListClient } from "./_components/CampaignsListClient";
import { dashDir, dt } from "@/lib/dashboard/i18n";

export const dynamic = "force-dynamic";
export const metadata = { get title() { return dt("الحملات التسويقية | التواصل"); } };

/** Server shell: gate first, render second  same contract as the three channel pages. */
export default async function CommunicationCampaignsPage() {
  const access = resolveDashboardPageAccess(await getServerSession(authOptions), "messages");
  if (!access.allowed) redirect(access.redirectTo);

  return (
    <div className="min-h-0" dir={dashDir()}>
      <div className="mx-auto max-w-[1600px]">
        <PageHeader
          eyebrow={dt("التواصل")}
          title={dt("الحملات التسويقية")}
          description={dt("أرسل قالبًا واحدًا لمجموعة متبرعين تختارها  كل متبرع يستلمه بلغته المفضّلة.")}
          icon={Megaphone}
        />
        <CampaignsListClient />
      </div>
    </div>
  );
}
