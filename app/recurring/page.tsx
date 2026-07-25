import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import { RecurringExperience } from "@/components/recurring/recurring-page-sections";
import { projects } from "@/data/projects";
export const metadata: Metadata = { title: "العطاء المستمر | مؤسسة منبر الأقصى الدولية", description: "اختر مشروعًا ومبلغًا يوميًا أو أسبوعيًا أو شهريًا ثم أضفه إلى السلة." };
export default function RecurringPage(){const eligible=projects.filter(project=>project.donationTypes.includes("recurring")&&project.status!=="archived");return <><TopUtilityBar/><SiteHeader/><main id="main-content"><RecurringExperience projects={eligible}/></main><SiteFooter/></>}
