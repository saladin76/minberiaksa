import { notFound } from "next/navigation";
import { CONFIG, parseKind } from "@/lib/content-editor/contracts";
import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { ContentEditor } from "@/components/dashboard/content-editor/ContentEditor";
export default async function ContentEditorPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind: raw, id } = await params, kind = parseKind(raw);
  if (!kind) notFound();
  await requireDashboardPagePermission(CONFIG[kind].permission);
  return <ContentEditor kind={kind} id={id} />;
}
