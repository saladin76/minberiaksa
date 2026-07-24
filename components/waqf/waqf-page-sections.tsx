import { ProjectFaq } from "@/components/project-detail/project-faq";
import { AlQudsGoldCoin } from "@/components/brand/al-quds-gold-coin";
import { GoldenIdentityPattern } from "@/components/brand/golden-identity-pattern";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import type { ProjectRecord, ProjectRegion, ProjectStatus } from "@/data/projects";
import { waqfDedicationExamples, waqfFaqs, waqfPrinciples, waqfReportingItems } from "@/data/waqf";
import { WaqfBuilder } from "./waqf-builder";

const regions: Record<ProjectRegion, string> = { "al-quds": "القدس", "al-aqsa": "الأقصى", gaza: "غزة", syria: "سوريا", sudan: "السودان", yemen: "اليمن", global: "مشاريع عامة" };
const statuses: Record<ProjectStatus, string> = { active: "متاح للدعم", seasonal: "موسمي", archived: "مكتمل", "needs-verification": "قيد المراجعة" };
const journey = [
  ["اختيار نوع الوقف", "حدد المساهمة المفتوحة أو الإهداء أو تمويل مشروع."],
  ["تسجيل صاحب الوقف", "أضف الاسم والنية أو الإهداء المرتبط بالوقف."],
  ["مراجعة البيانات", "راجع المشروع والمبلغ وصاحب الوقف قبل المتابعة."],
  ["ربط الوقف بالمشروع", "تُحفظ المساهمة داخل مسار الوقف بصورة مستقلة."],
  ["متابعة التنفيذ", "تظهر التحديثات الميدانية بعد اعتمادها."],
  ["الوصول إلى التقارير", "تُضاف الوثائق والتقارير عند توفرها رسميًا."],
] as const;

function Media({ project, big = false }: { project: ProjectRecord; big?: boolean }) {
  if (project.image) return <figure className={big ? "w-project-media big" : "w-project-media"}><img src={project.image.sourceUrl} alt={project.image.alt.ar} loading={big ? "eager" : "lazy"} /></figure>;
  return <div className={big ? "w-placeholder big" : "w-placeholder"}><span>{regions[project.region]}</span><strong>{project.title.ar}</strong><small>مشروع وقفي</small></div>;
}

export function WaqfPageSections({ projects }: { projects: ProjectRecord[] }) {
  const featured = projects.find((project) => project.featured && project.image) || projects.find((project) => project.image) || projects[0];
  const secondary = projects.filter((project) => project.id !== featured?.id).slice(0, 2);
  const choices = projects.map((project) => ({ id: project.id, slug: project.slug, title: project.title.ar }));

  return (
    <>
      <div className="w-breadcrumb"><Container><nav aria-label="مسار التنقل"><a href="/">الرئيسية</a><span>←</span><span aria-current="page">الوقف</span></nav></Container></div>
      <section className="w-hero w-hero--golden" aria-labelledby="w-hero-title"><GoldenIdentityPattern /><Container><div className="w-hero-copy"><span>وقف القدس · أثر ممتد</span><h1 id="w-hero-title">اجعل لك وقفًا باقيًا في القدس.</h1><p>اختر مشروعًا وقفيًا، سجّل اسم صاحب الوقف، وراجع بيانات المساهمة قبل إتمامها ضمن مسار واضح ومستقل.</p><div><Button href="#waqf-builder" size="large">أنشئ وقفًا</Button><Button href="#waqf-projects" variant="outline" size="large">استكشف المشاريع الوقفية</Button></div><ul><li>نية وقفية واضحة</li><li>بيانات صاحب الوقف</li><li>متابعة المشروع</li><li>تقارير عند اعتمادها</li></ul></div><div className="w-hero-media w-hero-media--gold">{featured ? <Media project={featured} big /> : <div className="w-placeholder big"><span>القدس</span><strong>مشروعات وقفية</strong></div>}<AlQudsGoldCoin decorative /></div></Container></section>

      <section className="w-action-first"><Container><WaqfBuilder projects={choices} /></Container></section>

      <section className="w-projects" id="waqf-projects"><Container><header><span>مشاريع وقفية</span><h2>اختر المشروع الذي تريد دعمه</h2><p>تعرض الصفحة المشروعات المسجلة ضمن نوع العطاء الوقفي فقط.</p></header>{featured ? <div className="w-project-showcase"><article className="w-featured"><Media project={featured} big /><div><small>{regions[featured.region]} · {statuses[featured.status]}</small><h3>{featured.title.ar}</h3><p>{featured.summary.ar}</p><div className="w-status"><span aria-hidden="true" />{featured.image ? "صورة ميدانية مرتبطة بالمشروع" : "الوسائط تُضاف بعد اعتمادها"}</div><footer><Button href={`/projects/${featured.slug}`} variant="outline">عرض المشروع</Button><Button href="#waqf-builder">ساهم في الوقف</Button></footer></div></article><div className="w-secondary">{secondary.map((project) => <article key={project.id}><Media project={project} /><div><small>{regions[project.region]} · {statuses[project.status]}</small><h3>{project.title.ar}</h3><p>{project.summary.ar}</p><Button href={`/projects/${project.slug}`} variant="outline" size="small">عرض المشروع</Button></div></article>)}</div></div> : <div className="w-empty">تُضاف المشاريع الوقفية بعد اعتمادها.</div>}</Container></section>

      <section className="w-what"><Container><div><span>المعنى العملي</span><h2>وقف اليوم<br />أثر يمتد بإذن الله</h2><p>الوقف عطاء طويل المدى يرتبط بمشروع أو منفعة مستمرة، ولا يمثل استثمارًا شخصيًا أو وعدًا بعائد مالي للمتبرع.</p><aside>تظهر تفاصيل كل مشروع وفق ملفه المعتمد وحالة تنفيذه الفعلية.</aside></div><div className="w-principles">{waqfPrinciples.map(([title, description], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{description}</p></article>)}</div></Container></section>

      <div className="w-supporting-grid">
        <section className="w-certificate-section" id="waqf-certificate"><Container><div className="w-certificate-intro"><span>شهادة الوقف</span><h2>تُبنى الشهادة من بيانات وقفك</h2><p>تظهر بيانات صاحب الوقف والمشروع والنية أثناء المراجعة، وتصدر النسخة النهائية بعد اكتمال العملية واعتمادها.</p></div><div className="w-certificate-principles"><article><strong>اسم صاحب الوقف</strong><p>يظهر كما أدخلته داخل أداة الوقف.</p></article><article><strong>المشروع والنية</strong><p>ترتبط الشهادة بالمشروع ومسار الوقف المختار.</p></article><article><strong>إصدار بعد الاعتماد</strong><p>لا تُعرض شهادة نهائية أو رقم وثيقة قبل اكتمال العملية.</p></article></div></Container></section>
        <section className="w-cycle w-cycle--journey" id="waqf-journey"><Container><header><span>متابعة الوقف</span><h2>من اختيار المساهمة إلى متابعة المشروع</h2><p>كل مرحلة تظهر بحالتها الفعلية دون وثائق أو نتائج غير معتمدة.</p></header><ol>{journey.map(([title, description], index) => <li key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p>{description}</p></div></li>)}</ol></Container></section>
      </div>

      <section className="w-record"><Container><div className="w-record-intro"><span>سجل الوقف</span><h2>كل وقف مرتبط بمشروعه وبياناته</h2><p>يساعد السجل المتبرع على معرفة صاحب الوقف والمشروع والنية وحالة التوثيق دون تحويل التجربة إلى منتج مالي.</p></div><article><header><small>ملخص المشروع الوقفي</small><h3>{featured?.title.ar || "مشروع وقفي"}</h3><p>{featured ? `${regions[featured.region]} · ${statuses[featured.status]}` : "القدس"}</p></header><dl><div><dt>نوع العطاء</dt><dd>وقف</dd></div><div><dt>حالة المشروع</dt><dd>{featured ? statuses[featured.status] : "قيد المراجعة"}</dd></div><div><dt>التقارير</dt><dd>تظهر بعد اعتمادها</dd></div><div><dt>المتابعة</dt><dd>من حساب المتبرع</dd></div></dl></article></Container></section>
      <section className="w-reporting"><Container><header><span>الاستمرارية</span><h2>تابع وقفك مع مرور الوقت</h2><p>المتابعة مرتبطة بالمشروع والمنفعة والتحديثات، وليس بعوائد أو أرباح.</p></header><div>{waqfReportingItems.map(([title, status], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><strong>{status}</strong></article>)}</div></Container></section>
      <section className="w-dedication"><Container><header><span>إهداء الوقف</span><h2>وقف باسم من تحب</h2><p>سجّل الاسم والنية داخل الأداة، ثم راجع البيانات قبل إتمام الوقف.</p></header><div>{waqfDedicationExamples.map(([title, description]) => <article key={title}><h3>{title}</h3><p>{description}</p><strong>يُكتب الاسم عند إنشاء الوقف</strong></article>)}</div></Container></section>
      <section className="w-faq"><Container><header><span>قبل إنشاء الوقف</span><h2>الأسئلة الشائعة</h2></header><ProjectFaq items={[...waqfFaqs]} /></Container></section>
      <section className="w-final"><Container><div><span>نية واضحة · مشروع وقفي · متابعة مستمرة</span><h2>اربط وقفك بمشروع يخدم القدس والأقصى</h2><p>اختر المشروع وصاحب الوقف والمبلغ، ثم راجع البيانات قبل المتابعة.</p></div><Button href="#waqf-builder" size="large">أنشئ وقفًا</Button></Container></section>
    </>
  );
}
