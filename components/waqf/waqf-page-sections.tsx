import { ProjectFaq } from "@/components/project-detail/project-faq";
import { WaqfBuilder } from "./waqf-builder";
import type { ProjectRecord } from "@/data/projects";
import { waqfFaqs } from "@/data/waqf";
export function WaqfPageSections({projects}:{projects:ProjectRecord[]}){const choices=projects.map(project=>({id:project.id,slug:project.slug,title:project.title.ar}));return <div className="production-giving-page waqf-production-page">
 <section className="simple-page-hero"><div className="site-container"><span>الوقف</span><h1>اختر مشروعًا وقفيًا وحدد مبلغ مساهمتك</h1><p>أدخل اسم صاحب الوقف، راجع الاختيار، ثم أضف المساهمة إلى السلة.</p></div></section>
 <section className="giving-tool-section"><div className="site-container"><header><span>أداة الوقف</span><h2>أنشئ مساهمتك الوقفية</h2></header><WaqfBuilder projects={choices}/></div></section>
 <section className="simple-project-list"><div className="site-container"><header><span>المشاريع الوقفية</span><h2>مشاريع متاحة للدعم</h2></header><div>{projects.map(project=><article key={project.id}>{project.image?<img src={project.image.sourceUrl} alt={project.image.alt.ar}/>:<div className="project-visual-fallback"><span>{project.region==="al-quds"?"القدس":project.region==="al-aqsa"?"الأقصى":"فلسطين"}</span><strong>{project.title.ar}</strong><small>مشروع وقفي</small></div>}<h3>{project.title.ar}</h3><p>{project.summary.ar}</p><a href={`/projects/${project.slug}`}>عرض المشروع</a></article>)}</div></div></section>
 <section className="giving-explanation"><div className="site-container"><h2>المتابعة والتقارير</h2><ul><li>ترتبط المساهمة بالمشروع المختار واسم صاحب الوقف.</li><li>تُعرض تحديثات التنفيذ والتقارير عند اعتمادها ونشرها.</li><li>لا تُعرض شهادة أو رقم وثيقة قبل وجود نظام إصدار معتمد.</li></ul></div></section>
 <section className="simple-faq"><div className="site-container"><header><span>الأسئلة الشائعة</span><h2>أسئلة عن الوقف</h2></header><ProjectFaq items={[...waqfFaqs]}/></div></section>
 </div>}
