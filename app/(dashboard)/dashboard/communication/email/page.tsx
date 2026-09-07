import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { EmailChannelDashboard } from "./_components/EmailChannelDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "البريد الإلكتروني | التواصل" };

/**
 * Server shell: gate first, render second. The permission check lives here rather than in the
 * client component so an unauthorised user never receives the markup at all.
 */
export default async function EmailChannelPage() {
  const access = resolveDashboardPageAccess(await getServerSession(authOptions), "messages");
  if (!access.allowed) redirect(access.redirectTo);

  return <EmailChannelDashboard />;
}
