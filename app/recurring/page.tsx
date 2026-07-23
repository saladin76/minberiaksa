import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import { RecurringExperience } from "@/components/recurring/recurring-page-sections";
import { projects } from "@/data/projects";
export const metadata: Metadata = { title: "التبرع المستمر لفلسطين | مؤسسة منبر الأقصى الدولية", description: "أنشئ خطة عطاء يومية أو أسبوعية أو شهرية، واختر المشروع أو المسار الذي ترغب في دعمه بصورة مستمرة." };
export default function RecurringPage(){const eligible=projects.filter(project=>project.donationTypes.includes("recurring"));const experience=RecurringExperience({projects:eligible});return <><TopUtilityBar/><SiteHeader/><main id="main-content" className={experience.props.className}>{experience.props.children}<section className="recurring-account-gateway"><div className="site-container"><div><span>إدارة مستقبلية داخل الحساب</span><h2>تابع خططك ووثائقك من مساحة واحدة</h2><p>هذه الروابط تفتح حساب Demo فقط، ولا تدير خطة أو إيصالًا حقيقيًا.</p></div><div><a href="/account/recurring?demo=1">عرض خططي في الحساب</a><a href="/account/documents?demo=1">عرض وثائق العطاء</a></div></div></section></main><SiteFooter/></>}
