import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function MarketingArchiveFilesPage() {
  redirect("/dashboard/archive/assets?category=MARKETING");
}
