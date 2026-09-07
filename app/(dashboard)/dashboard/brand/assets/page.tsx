import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function BrandAssetsPage() {
  redirect("/dashboard/archive/assets?source=legacy-brand");
}
