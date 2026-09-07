import { ArchiveConsole } from "../_components/ArchiveConsole";
import { getArchiveSnapshotDbBacked } from "@/lib/archive/archive-service";

export const metadata = { title: "Archive Marketing Picks | لوحة التحكم" };
export const dynamic = "force-dynamic";

export default async function ArchiveMarketingPicksPage() {
  const snapshot = await getArchiveSnapshotDbBacked();
  return <ArchiveConsole activeTab="marketing-picks" snapshot={snapshot} work="marketing" />;
}
