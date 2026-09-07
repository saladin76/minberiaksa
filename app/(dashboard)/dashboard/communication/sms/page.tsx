import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { SmsChannelDashboard } from "./_components/SmsChannelDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "الرسائل النصية | التواصل" };

/** Server shell: gate first, render second — same contract as the البريد and واتساب pages. */
export default async function SmsChannelPage() {
  const access = resolveDashboardPageAccess(await getServerSession(authOptions), "messages");
  if (!access.allowed) redirect(access.redirectTo);

  return <SmsChannelDashboard />;
}
