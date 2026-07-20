import type {Metadata} from "next";
import {SiteFooter} from "@/components/layout/site-footer";
import {SiteHeader} from "@/components/layout/site-header";
import {TopUtilityBar} from "@/components/layout/top-utility-bar";
import {RecurringExperience} from "@/components/recurring/recurring-page-sections";
import {projects} from "@/data/projects";
export const metadata:Metadata={title:"التبرع المستمر لفلسطين | مؤسسة منبر الأقصى الدولية",description:"أنشئ خطة عطاء يومية أو أسبوعية أو شهرية، واختر المشروع أو المسار الذي ترغب في دعمه بصورة مستمرة."};
export default function RecurringPage(){const eligible=projects.filter(p=>p.donationTypes.includes("recurring"));return <><TopUtilityBar/><SiteHeader/><RecurringExperience projects={eligible}/><SiteFooter/></>}
