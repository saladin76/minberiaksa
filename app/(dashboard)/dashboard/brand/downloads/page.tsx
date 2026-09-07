import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function BrandDownloadsPage() {
  redirect("/dashboard/archive/assets?source=legacy-brand");
}
