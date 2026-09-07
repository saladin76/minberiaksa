import { ArchiveConsole } from "../_components/ArchiveConsole";
import { getArchiveSnapshotDbBacked } from "@/lib/archive/archive-service";

export const metadata = { title: "Archive AI | لوحة التحكم" };
export const dynamic = "force-dynamic";

export default async function ArchiveAiPage() {
  const snapshot = await getArchiveSnapshotDbBacked();
  return <ArchiveConsole activeTab="ai" snapshot={snapshot} />;
}
