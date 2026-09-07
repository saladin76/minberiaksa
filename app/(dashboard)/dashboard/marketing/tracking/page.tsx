import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import ConversionEventsPage from "../../conversion-events/page";

export const metadata = { title: "التتبع والتحويلات | لوحة التحكم" };
export const dynamic = "force-dynamic";

export default async function MarketingTrackingPage() {
  const access = resolveDashboardPageAccess(await getServerSession(authOptions), "pixels");
  if (!access.allowed) redirect(access.redirectTo);
  return <ConversionEventsPage />;
}
