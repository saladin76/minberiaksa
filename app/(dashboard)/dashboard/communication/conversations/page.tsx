import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { dt } from "@/lib/dashboard/i18n";
import { ConversationsWorkspace } from "./_components/ConversationsWorkspace";

export const dynamic = "force-dynamic";
export const metadata = { get title() { return dt("المحادثات | التواصل"); } };

/** The new WhatsApp inbox (phase 2): language tabs, assignment, WhatsApp-Web layout. Same gate as the inbox. */
export default async function ConversationsPage() {
  const session = await getServerSession(authOptions);
  const access = resolveDashboardPageAccess(session, "messages");
  if (!access.allowed) redirect(access.redirectTo);
  return <ConversationsWorkspace currentUserId={session?.user?.id ?? null} />;
}
