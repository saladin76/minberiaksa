import { ArchiveConsole } from "../_components/ArchiveConsole";
import { getArchiveSnapshotDbBacked } from "@/lib/archive/archive-service";

export const metadata = { title: "Archive Collections | لوحة التحكم" };
export const dynamic = "force-dynamic";

export default async function ArchiveCollectionsPage() {
  const snapshot = await getArchiveSnapshotDbBacked();
  return <ArchiveConsole activeTab="collections" snapshot={snapshot} />;
}
