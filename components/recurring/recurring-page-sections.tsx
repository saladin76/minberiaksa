import { ProjectFaq } from "@/components/project-detail/project-faq";
import { RecurringPlanBuilder } from "./recurring-plan-builder";
import type { ProjectRecord } from "@/data/projects";
import { recurringFaq } from "@/data/recurring";

export function RecurringExperience({ projects }: { projects: ProjectRecord[] }) {
  return <div className="recurring-page production-giving-page">
    <section className="simple-page-hero"><div className="site-container"><span>العطاء المستمر</span><h1>اختر مشروعًا ومبلغًا يتكرر وفق ما يناسبك</h1><p>أنشئ اختيارك اليومي أو الأسبوعي أو الشهري، راجعه، ثم أضفه إلى السلة. لا يتم تحصيل أي مبلغ داخل هذه الصفحة.</p></div></section>
    <section className="giving-tool-section"><div className="site-container"><header><span>خطتك</span><h2>أنشئ خطة العطاء</h2><p>اتبع الخطوات الخمس بالترتيب.</p></header><RecurringPlanBuilder projects={projects}/></div></section>
    <section className="simple-project-list"><div className="site-container"><header><span>المشاريع المتاحة</span><h2>مشاريع تقبل العطاء المستمر</h2></header><div>{projects.map((project)=><article key={project.id}>{project.image?<img src={project.image.sourceUrl} alt={project.image.alt.ar}/>:<div className="project-visual-fallback"><span>{project.region==="gaza"?"غزة":project.region==="al-quds"?"القدس":"فلسطين"}</span><strong>{project.title.ar}</strong><small>عطاء مستمر</small></div>}<h3>{project.title.ar}</h3><p>{project.summary.ar}</p><a href={`/projects/${project.slug}`}>عرض المشروع</a></article>)}</div></div></section>
    <section className="simple-faq"><div className="site-container"><header><span>الأسئلة الشائعة</span><h2>قبل إضافة الخطة</h2></header><ProjectFaq items={recurringFaq}/></div></section>
  </div>;
}
