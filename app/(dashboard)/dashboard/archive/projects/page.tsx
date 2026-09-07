import { ArchiveConsole } from "../_components/ArchiveConsole";
import { getArchiveSnapshotDbBacked } from "@/lib/archive/archive-service";

export const metadata = { title: "Archive Projects | لوحة التحكم" };
export const dynamic = "force-dynamic";

export default async function ArchiveProjectsPage() {
  const snapshot = await getArchiveSnapshotDbBacked();
  return <ArchiveConsole activeTab="projects" snapshot={snapshot} />;
}
