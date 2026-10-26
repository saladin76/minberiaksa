/** Group locale jobs by article identity; identical titles can be different articles. */
export function groupEditorialJobs<T extends {id: string; sourceId?: string; resultContentId?: string}>(jobs: T[]): {key: string; jobs: T[]}[] {
  const groups = new Map<string, T[]>();
  for (const job of jobs) {
    const key = job.sourceId || job.resultContentId || job.id;
    const group = groups.get(key) || [];
    group.push(job);
    groups.set(key, group);
  }
  return [...groups].map(([key, jobs]) => ({key, jobs}));
}
