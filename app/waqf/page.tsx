import type {Metadata} from "next";
import {SiteFooter} from "@/components/layout/site-footer";
import {SiteHeader} from "@/components/layout/site-header";
import {TopUtilityBar} from "@/components/layout/top-utility-bar";
import {WaqfPageSections} from "@/components/waqf/waqf-page-sections";
import {projects} from "@/data/projects";

export const metadata:Metadata={title:"وقف القدس | مؤسسة منبر الأقصى الدولية",description:"ساهم في مشروع وقفي يخدم أهل القدس، واختر اسم صاحب الوقف، وتابع أثر المساهمة وتقارير المشروع."};
export default function WaqfPage(){const eligible=projects.filter(p=>p.donationTypes.includes("waqf"));return <><TopUtilityBar/><SiteHeader/><main id="main-content"><WaqfPageSections projects={eligible}/></main><SiteFooter/></>}
