import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ArchiveDocumentsPage() {
  redirect("/dashboard/archive/assets?category=DOCUMENTS");
}
