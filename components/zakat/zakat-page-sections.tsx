import { ProjectFaq } from "@/components/project-detail/project-faq";
import { ZakatCalculator } from "./zakat-calculator";
import type { ProjectRecord } from "@/data/projects";
import type { ProjectMetric } from "@/data/project-metrics";
import { zakatFaqs } from "@/data/zakat";
export function ZakatPageSections({projects,metrics}:{projects:ProjectRecord[];metrics:ProjectMetric[]}){void metrics;const choices=projects.map(project=>({id:project.id,slug:project.slug,title:project.title.ar}));return <div className="production-giving-page zakat-production-page">
 <section className="simple-page-hero"><div className="site-container"><span>الزكاة</span><h1>احسب زكاتك تقديريًا واختر مشروعًا مؤهلًا</h1><p>أدخل القيم، راجع النتيجة، ثم أضف مبلغ الزكاة إلى السلة. لا يتم حفظ تفاصيل أموالك.</p></div></section>
 <section className="giving-tool-section"><div className="site-container"><header><span>الحاسبة والنتيجة</span><h2>احسب مقدار الزكاة</h2></header><ZakatCalculator projects={choices}/></div></section>
 <section className="simple-project-list"><div className="site-container"><header><span>المشاريع المؤهلة</span><h2>اختر أين تصل زكاتك</h2></header><div>{projects.map(project=><article key={project.id}>{project.image?<img src={project.image.sourceUrl} alt={project.image.alt.ar}/>:<div className="project-visual-fallback"><span>{project.region==="gaza"?"غزة":project.region==="al-quds"?"القدس":"فلسطين"}</span><strong>{project.title.ar}</strong><small>مشروع زكاة</small></div>}<h3>{project.title.ar}</h3><p>{project.summary.ar}</p><a href={`/projects/${project.slug}`}>عرض المشروع</a></article>)}</div></div></section>
 <section className="giving-explanation"><div className="site-container"><h2>معلومات مختصرة</h2><ul><li>النسبة العامة المستخدمة في الحاسبة هي 2.5% من صافي الأموال الزكوية.</li><li>النتيجة تقديرية ولا تغني عن الاستشارة الشرعية للحالات الخاصة.</li><li>تظهر تحديثات المشروع وتقاريره عند نشرها رسميًا.</li></ul></div></section>
 <section className="simple-faq"><div className="site-container"><header><span>الأسئلة الشائعة</span><h2>أسئلة عن الزكاة</h2></header><ProjectFaq items={[...zakatFaqs]}/></div></section>
 </div>}
