import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { WhatsappChannelDashboard } from "./_components/WhatsappChannelDashboard";
import { dt } from "@/lib/dashboard/i18n";

export const dynamic = "force-dynamic";
export const metadata = { get title() { return dt("واتساب | التواصل"); } };

/** Server shell: gate first, render second  same contract as the البريد page. */
export default async function WhatsappChannelPage() {
  const access = resolveDashboardPageAccess(await getServerSession(authOptions), "messages");
  if (!access.allowed) redirect(access.redirectTo);

  return <WhatsappChannelDashboard />;
}
