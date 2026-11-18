import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { redirect } from "next/navigation";
import GalleryManager from "./GalleryManager";
export const dynamic = "force-dynamic";
export default async function GalleryPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") redirect("/dashboard");
  return <GalleryManager />;
}
