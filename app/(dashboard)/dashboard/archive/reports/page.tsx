import { ArchiveConsole } from "../_components/ArchiveConsole";
import { getArchiveSnapshotDbBacked } from "@/lib/archive/archive-service";

export const metadata = { title: "Archive Reports | لوحة التحكم" };
export const dynamic = "force-dynamic";

export default async function ArchiveReportsPage() {
  const snapshot = await getArchiveSnapshotDbBacked();
  return <ArchiveConsole activeTab="reports" snapshot={snapshot} />;
}
