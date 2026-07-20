import type {Metadata} from "next";
import {SiteFooter} from "@/components/layout/site-footer";
import {SiteHeader} from "@/components/layout/site-header";
import {TopUtilityBar} from "@/components/layout/top-utility-bar";
import {ZakatPageSections} from "@/components/zakat/zakat-page-sections";
import {projectMetrics} from "@/data/project-metrics";
import {projects} from "@/data/projects";

export const metadata:Metadata={title:"زكاتك لفلسطين | مؤسسة منبر الأقصى الدولية",description:"احسب مقدار زكاتك تقديريًا، واختر مشروعًا مؤهلًا، وأضف زكاتك إلى مسار مستقل وواضح."};
export default function ZakatPage(){const eligible=projects.filter(p=>p.donationTypes.includes("zakat"));return <><TopUtilityBar/><SiteHeader/><main id="main-content"><ZakatPageSections projects={eligible} metrics={projectMetrics}/></main><SiteFooter/></>}
