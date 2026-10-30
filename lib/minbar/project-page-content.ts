import { galleryFor } from "./content/media";
import { getProjectDonorCount, listProjectComments, listProjectUpdates, listRelatedProjects, type MinbarProject, type MinbarProjectComment, type MinbarProjectUpdate } from "./projects";

export type ProjectPageContent = {
  donorCount: number; updates: MinbarProjectUpdate[]; comments: MinbarProjectComment[];
  related: MinbarProject[]; gallery: string[];
};

/** One public page composition for live pages and the authenticated draft
 * preview. Counts/history are read only for an existing project. */
export async function getProjectPageContent(project: MinbarProject, locale: string): Promise<ProjectPageContent> {
  const saved = /^[a-f0-9]{24}$/i.test(project.id);
  const [updates, related, donorCount, comments] = await Promise.all([
    saved ? listProjectUpdates(project.id, locale) : Promise.resolve([]),
    listRelatedProjects(project, locale),
    saved ? getProjectDonorCount(project.id) : Promise.resolve(0),
    saved ? listProjectComments(project.id) : Promise.resolve([]),
  ]);
  const own = project.images.slice(1), regional = project.region ? galleryFor(project.region, 6) : [];
  const gallery = [...new Set([...own, ...regional])].slice(0, Math.max(6, own.length));
  return { updates, related, donorCount, comments, gallery };
}
