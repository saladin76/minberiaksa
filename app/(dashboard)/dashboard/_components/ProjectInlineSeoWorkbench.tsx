'use client';

import { usePathname } from 'next/navigation';
import { SeoPanel } from '@/components/dashboard/campaigns/SeoPanel';

const SEO_PORTAL_ID = 'dashboard-project-seo-workbench';

function getProjectIdFromPath(pathname: string) {
  const match = pathname.match(/\/dashboard\/campaigns\/edit\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function ProjectInlineSeoWorkbench() {
  const pathname = usePathname();
  const isProjectEdit = pathname.includes('/dashboard/campaigns/edit/');
  const projectId = getProjectIdFromPath(pathname);

  if (!isProjectEdit || !projectId) return null;

  return (
    <div id={SEO_PORTAL_ID} className="mt-3">
      <SeoPanel campaignId={projectId} />
    </div>
  );
}
