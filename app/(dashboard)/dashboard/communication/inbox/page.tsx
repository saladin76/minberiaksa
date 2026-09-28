import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { WhatsappInbox } from "./_components/WhatsappInbox";

export const dynamic = "force-dynamic";
export const metadata = { title: "صندوق واتساب | التواصل" };

/** Server shell: gate first, render second — same contract as the واتساب channel page. */
export default async function WhatsappInboxPage() {
  const access = resolveDashboardPageAccess(await getServerSession(authOptions), "messages");
  if (!access.allowed) redirect(access.redirectTo);

  return <WhatsappInbox />;
}
