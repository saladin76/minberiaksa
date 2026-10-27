import { notFound } from "next/navigation";
import { CONFIG, parseKind } from "@/lib/content-editor/contracts";
import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { ContentEditor } from "@/components/dashboard/content-editor/ContentEditor";
export default async function ContentEditorPage({ params, searchParams }: { params: Promise<{ kind: string; id: string }>; searchParams: Promise<{locale?: string; section?: string; campaignId?: string}> }) {
  const { kind: raw, id } = await params, kind = parseKind(raw);
  if (!kind) notFound();
  await requireDashboardPagePermission(CONFIG[kind].permission);
  const selection = await searchParams;
  return <ContentEditor kind={kind} id={id} initialCampaignId={kind === "videos" && id === "new" && /^[a-f0-9]{24}$/i.test(selection.campaignId || "") ? selection.campaignId : undefined} initialLocale={selection.locale} initialSection={selection.section} key={`${kind}:${id}:${selection.locale || "ar"}:${selection.section || "content"}`} />;
}
