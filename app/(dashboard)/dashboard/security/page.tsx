import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { redirect } from "next/navigation";
import SiteSecurityManager from "./SiteSecurityManager";
export const dynamic = "force-dynamic";
export default async function SecurityPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") redirect("/dashboard");
  return <SiteSecurityManager />;
}
