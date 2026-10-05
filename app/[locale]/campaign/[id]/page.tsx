import { notFound, permanentRedirect } from "next/navigation";
import { getProject } from "@/lib/minbar/projects";

interface Props {
  params: Promise<{ id: string; locale: string }>;
}

/**
 * Legacy campaign URL.
 *
 * Public projects now have one canonical route only:
 *   /{locale}/projects/{localizedSlug}
 *
 * Keeping a second renderer under /campaign created duplicate indexable pages,
 * split SEO authority, and allowed disabled projects to remain reachable through
 * the old surface. Resolve only an active/non-deleted project, then issue a
 * permanent redirect to the modern project detail page.
 */
export default async function LegacyCampaignRedirect({ params }: Props) {
  const { id, locale } = await params;
  const project = await getProject(decodeURIComponent(id), locale);

  if (!project) notFound();

  permanentRedirect(
    `/${locale}/projects/${encodeURIComponent(project.slug)}`
  );
}
