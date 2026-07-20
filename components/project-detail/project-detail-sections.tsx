import { Button } from "@/components/ui/button";
import { ProjectAnchorNavigation } from "./project-anchor-navigation";
import { ProjectDonationPanel } from "./project-donation-panel";
import { ProjectFaq } from "./project-faq";
import type { ProjectMetric } from "@/data/project-metrics";
import type { DonationType, ProjectRecord, ProjectRegion, ProjectStatus } from "@/data/projects";
import type { ResolvedProjectDetail } from "@/data/project-details";

const regionLabels: Record<ProjectRegion, string> = {
  "al-quds": "القدس", "al-aqsa": "الأقصى", gaza: "غزة", syria: "سوريا", sudan: "السودان", yemen: "اليمن", global: "فلسطين والعالم",
};
const donationLabels: Record<DonationType, string> = { sadaqah: "صدقة", zakat: "زكاة", waqf: "وقف", recurring: "تبرع مستمر", qurbani: "أضاحي" };
const statusLabels: Record<ProjectStatus, string> = { active: "نشط", seasonal: "موسمي", archived: "مكتمل", "needs-verification": "قيد التحقق" };
const updateStatusLabels = { verified: "تحديث موثّق", review: "قيد المراجعة", planned: "مخطط للتنفيذ", report: "تقرير متاح", required: "بيانات مطلوبة" } as const;
const proofStatusLabels = { available: "متاح", verification: "قيد التحقق", later: "سيُضاف لاحقًا", unavailable: "غير متوفر لهذا المشروع" } as const;

function ProjectHeroMedia({ project }: { project: ProjectRecord }) {
  if (project.image) return <figure className="project-detail-hero-media"><img src={project.image.sourceUrl} alt={project.image.alt.ar} /><figcaption>Temporary official source · {project.image.sourceLabel}</figcaption></figure>;
  return <div className="project-detail-hero-placeholder" role="img" aria-label={`صورة رئيسية مطلوبة لمشروع ${project.title.ar}`}>
    <strong>APPROVED PROJECT HERO REQUIRED</strong>
    <span>{project.title.ar} · {regionLabels[project.region]}</span>
    <small>صورة ميدانية حقيقية · مصدر موثّق · Minimum 2400 × 1600 · Mobile crop مستقل · No AI · No tourism stock · No shocking imagery</small>
  </div>;
}

function ProjectMetrics({ project, metric }: { project: ProjectRecord; metric?: ProjectMetric }) {
  if (!metric) return <div className="project-metrics-empty"><strong>بيانات التمويل قيد الاعتماد</strong><p>سيتم تحديث تقدم المشروع بعد التحقق من البيانات الرسمية.</p></div>;
  const progress = Math.min(100, metric.raised / metric.goal * 100);
  return <div className="project-detail-metrics"><small>DATA REQUIRES FINAL VERIFICATION</small><div className="project-metric-numbers"><div><span>تم جمعه</span><strong>{metric.raised.toLocaleString("en-US")} USD</strong></div><div><span>الهدف</span><strong>{metric.goal.toLocaleString("en-US")} USD</strong></div><div><span>المتبرعون</span><strong>{metric.donors.toLocaleString("en-US")}</strong></div><div><span>المساهمة الأساسية</span><strong>{metric.unitAmount} USD</strong></div></div><div className="project-detail-progress" role="progressbar" aria-label={`نسبة تمويل ${project.title.ar}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{ width: `${progress}%` }} /></div></div>;
}

export function ProjectDetailExperience({ project, detail, metric, relatedProjects, faqs }: { project: ProjectRecord; detail: ResolvedProjectDetail; metric?: ProjectMetric; relatedProjects: ProjectRecord[]; faqs: { question: string; answer: string }[] }) {
  const urgent = project.tags.includes("emergency") || project.tags.includes("urgent");
  const proofLabel = project.image ? "مصدر ميداني مؤقت متاح" : "الوسائط قيد الاعتماد";
  return <main id="main-content" className="project-detail-page">
    <div className="site-container">
      <nav className="project-breadcrumb" aria-label="مسار التنقل"><a href="/">الرئيسية</a><span aria-hidden="true">←</span><a href="/projects">المشاريع</a><span aria-hidden="true">←</span><span aria-current="page">{project.title.ar}</span></nav>
      <div className="project-detail-shell">
        <div className="project-detail-primary">
          <section className="project-detail-hero" aria-labelledby="project-title">
            <ProjectHeroMedia project={project} />
            <div className="project-detail-hero-copy">
              <div className="project-detail-badges"><span>مشروع رسمي من مؤسسة منبر الأقصى</span><b>{regionLabels[project.region]}</b><i>{urgent ? "عاجل" : statusLabels[project.status]}</i></div>
              <h1 id="project-title">{project.title.ar}</h1>
              <p>{project.summary.ar}</p>
              <div className="project-detail-donation-types">{project.donationTypes.map((type) => <span key={type}>{donationLabels[type]}</span>)}</div>
              <div className="project-proof-line"><span aria-hidden="true">✓</span><strong>{proofLabel}</strong><small>آخر تحديث: التاريخ مطلوب</small></div>
              {detail.isFallback && <p className="fallback-detail-label">تفاصيل التنفيذ قيد الاعتماد · بيانات الأثر مطلوبة</p>}
              <ProjectMetrics project={project} metric={metric} />
            </div>
          </section>
          <ProjectAnchorNavigation />
          <section id="story" className="project-editorial-section project-story" aria-labelledby="story-title"><div className="project-section-heading"><span>سياق المشروع</span><h2 id="story-title">قصة المشروع</h2></div><div className="project-story-layout"><div className="project-story-copy">{detail.story.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}<blockquote>{detail.highlight}</blockquote></div><div className="project-story-facts"><div><span>الاحتياج</span><strong>{detail.need}</strong></div><div><span>هدف المشروع</span><strong>{detail.goal}</strong></div><div><span>موقع التنفيذ</span><strong>{detail.location}</strong></div><div><span>المرحلة الحالية</span><strong>{detail.currentStage}</strong></div></div></div></section>
          <section id="impact-plan" className="project-editorial-section project-impact-plan" aria-labelledby="impact-plan-title"><div className="project-section-heading"><span>مسار التنفيذ</span><h2 id="impact-plan-title">كيف تُستخدم مساهمتك؟</h2><p>لا تُعرض نسب مالية غير مؤكدة؛ يوضح هذا المسار مراحل الاستخدام العامة فقط.</p></div><ol className="impact-plan-steps">{detail.impactPlan.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong></li>)}</ol><div className="beneficiary-strip"><span>الفئات المستفيدة</span>{detail.beneficiaries?.length ? <div>{detail.beneficiaries.map((item) => <strong key={item}>{item}</strong>)}</div> : <p>الفئات المستفيدة التفصيلية قيد التحقق.</p>}</div></section>
          <section id="updates" className="project-editorial-section project-updates" aria-labelledby="updates-title"><div className="project-section-heading"><span>من الميدان</span><h2 id="updates-title">تحديثات المشروع</h2></div>{detail.updates.length ? <ol className="project-update-timeline">{detail.updates.map((update) => <li key={update.id}><div className="update-marker" aria-hidden="true" /><article><div className="update-meta"><span>{update.dateLabel}</span><b>{update.stage}</b><i>{updateStatusLabels[update.status]}</i></div><h3>{update.title}</h3><p>{update.description}</p>{update.mediaLabel && <div className="update-media-placeholder">{update.mediaLabel}</div>}<small>مصدر التوثيق: {update.sourceLabel}</small></article></li>)}</ol> : <div className="project-updates-empty"><h3>ستظهر تحديثات المشروع هنا</h3><p>سيتم نشر مراحل التنفيذ والصور والتقارير بعد اعتمادها من الفريق الميداني.</p></div>}</section>
          <section id="proof" className="project-editorial-section project-proof" aria-labelledby="proof-title"><div className="project-section-heading"><span>الشفافية</span><h2 id="proof-title">توثيق واضح لكل مرحلة</h2></div><div className="project-proof-layout"><div className="project-proof-list">{detail.proofItems.map((item) => <article key={item.label}><span aria-hidden="true">✓</span><div><h3>{item.label}</h3><strong>{proofStatusLabels[item.status]}</strong><p>{item.note}</p></div></article>)}</div><div className="project-document-preview"><small>معاينة عنصر التوثيق</small><div>DOCUMENT PREVIEW REQUIRED</div><h3>تقرير المشروع</h3><p>لا يتم إنشاء مستند رسمي نهائي أو عرض بيانات مختلقة داخل هذا النموذج.</p><code>PROJECT-REPORT-PREVIEW</code></div></div></section>
          <section id="media" className="project-editorial-section project-media" aria-labelledby="media-title"><div className="project-section-heading"><span>الوسائط</span><h2 id="media-title">من الميدان</h2></div><div className="project-media-feature"><strong>APPROVED FIELD MEDIA REQUIRED</strong><span>مصدر موثّق · صورة أو فيديو مستقل عن صورة Hero</span></div><div className="project-media-grid">{detail.media.map((item) => <article key={`${item.kind}-${item.label}`}><span>{item.kind === "video" ? "VIDEO" : item.kind === "before-after" ? "BEFORE / AFTER" : "IMAGE"}</span><h3>{item.label}</h3><p>{item.requirement}</p></article>)}</div></section>
          <section id="faq" className="project-editorial-section project-faq" aria-labelledby="faq-title"><div className="project-section-heading"><span>قبل التبرع</span><h2 id="faq-title">الأسئلة الشائعة</h2></div><ProjectFaq items={faqs} /></section>
          <section className="project-editorial-section related-projects" aria-labelledby="related-title"><div className="project-section-heading"><span>مشاريع رسمية</span><h2 id="related-title">مشاريع رسمية قد تهمك</h2></div><div className="related-projects-grid">{relatedProjects.map((related) => <article key={related.id}><a className="related-project-media" href={`/projects/${related.slug}`} aria-label={`عرض مشروع ${related.title.ar}`}>{related.image ? <img src={related.image.sourceUrl} alt={related.image.alt.ar} loading="lazy" /> : <span>APPROVED PROJECT IMAGE REQUIRED</span>}</a><div><small>{regionLabels[related.region]}</small><h3><a href={`/projects/${related.slug}`}>{related.title.ar}</a></h3><div>{related.donationTypes.map((type) => <span key={type}>{donationLabels[type]}</span>)}</div><Button href={`/projects/${related.slug}`} variant="outline" size="small">عرض المشروع</Button></div></article>)}</div></section>
        </div>
        <div className="project-donation-column"><ProjectDonationPanel project={project} metric={metric} suggestedAmounts={detail.suggestedAmounts} acceptsGift={detail.acceptsGift} /></div>
      </div>
    </div>
  </main>;
}
