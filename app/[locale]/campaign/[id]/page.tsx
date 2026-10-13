import { notFound, permanentRedirect } from "next/navigation";
import { getProject } from "@/lib/minbar/projects";
import { miaPath } from "@/lib/minbar/routes";
import { withIncomingQuery, type IncomingSearchParams } from "@/lib/minbar/redirect-query";

interface Props {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<IncomingSearchParams>;
}

/**
 * Legacy campaign URL.
 *
 * Public projects now have one canonical route only:
 *   /{locale}/bagislar/{localizedSlug}
 *
 * Keeping a second renderer under /campaign created duplicate indexable pages,
 * split SEO authority, and allowed disabled projects to remain reachable through
 * the old surface. Resolve only an active/non-deleted project, then issue a
 * permanent redirect to the modern project detail page.
 */
export default async function LegacyCampaignRedirect({ params, searchParams }: Props) {
  const [{ id, locale }, query] = await Promise.all([params, searchParams]);
  const project = await getProject(decodeURIComponent(id), locale);

  if (!project) notFound();

  // The query rides along: old ad links carry utm_* / gclid / fbclid.
  permanentRedirect(
    withIncomingQuery(miaPath("projectDetail", locale, encodeURIComponent(project.slug)), query)
  );
}
