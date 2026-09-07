import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardFallbackHref } from "@/lib/dashboard/page-access";

export const dynamic = "force-dynamic";

export default async function BrandTypographyPage() {
  redirect(resolveDashboardFallbackHref(await getServerSession(authOptions)));
}
