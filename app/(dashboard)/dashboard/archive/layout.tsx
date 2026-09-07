import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { ArchiveSubNav } from "./_components/ArchiveSubNav";

export const dynamic = "force-dynamic";

export default async function ArchiveLayout({ children }: { children: React.ReactNode }) {
  const access = resolveDashboardPageAccess(await getServerSession(authOptions), "archive");
  if (!access.allowed) redirect(access.redirectTo);

  // Mounted in the layout rather than per page, so all eight live archive routes share one
  // navigation without eight separate edits — and new archive pages inherit it for free.
  return (
    <>
      <ArchiveSubNav />
      {children}
    </>
  );
}
