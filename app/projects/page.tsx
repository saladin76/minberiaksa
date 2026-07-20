import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { StickyDonateBar } from "@/components/layout/sticky-donate-bar";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import { ProjectsDetailLinkEnhancer } from "@/components/projects/projects-detail-link-enhancer";
import { ProjectsExplorer } from "@/components/projects/projects-explorer";
import { ProjectsHero } from "@/components/projects/projects-hero";
import { projectMetrics } from "@/data/project-metrics";
import { projects } from "@/data/projects";

export default function ProjectsPage(){return <><TopUtilityBar/><SiteHeader/><main id="main-content"><ProjectsHero projects={projects}/><ProjectsExplorer projects={projects} metrics={projectMetrics}/><ProjectsDetailLinkEnhancer projects={projects}/></main><SiteFooter/><StickyDonateBar/></>}
