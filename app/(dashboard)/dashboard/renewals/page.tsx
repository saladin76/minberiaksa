import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { redirect } from "next/navigation";
import RenewalsManager from "./RenewalsManager";
export const dynamic = "force-dynamic";
export default async function RenewalsPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") redirect("/dashboard");
  return <RenewalsManager />;
}
