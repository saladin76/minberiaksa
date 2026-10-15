import { ArchiveConsole } from "../_components/ArchiveConsole";
import { getArchiveSnapshotDbBacked } from "@/lib/archive/archive-service";
import { dt } from "@/lib/dashboard/i18n";

export const metadata = { get title() { return dt("Archive AI | لوحة التحكم"); } };
export const dynamic = "force-dynamic";

export default async function ArchiveAiPage() {
  const snapshot = await getArchiveSnapshotDbBacked();
  return <ArchiveConsole activeTab="ai" snapshot={snapshot} />;
}
