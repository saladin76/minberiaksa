import { Button } from "@/components/ui/button";
import { ProjectAnchorNavigation } from "./project-anchor-navigation";
import { ProjectDonationPanel } from "./project-donation-panel";
import { ProjectFaq } from "./project-faq";
import type { ProjectMetric } from "@/data/project-metrics";
import type { DonationType, ProjectRecord, ProjectRegion, ProjectStatus } from "@/data/projects";
import type { ResolvedProjectDetail } from "@/data/project-details";

const regionLabels: Record<ProjectRegion, string> = {
  "al-quds": "القدس",
  "al-aqsa": "الأقصى",
  gaza: "غزة",
  syria: "سوريا",
  sudan: "السودان",
  yemen: "اليمن",
  global: "فلسطين والعالم",
};

const donationLabels: Record<DonationType, string> = {
  sadaqah: "صدقة",
  zakat: "زكاة",
  waqf: "وقف",
  recurring: "تبرع دوري",
  qurbani: "أضاحي",
};

const statusLabels: Record<ProjectStatus, string> = {
  active: "متاح للتبرع",
  seasonal: "موسمي",
  archived: "مكتمل",
  "needs-verification": "قيد المراجعة",
};

const updateStatusLabels = {
  verified: "منشور",
  review: "قيد المراجعة",
  planned: "قيد التجهيز",
  report: "تقرير متاح",
  required: "لا يوجد تحديث بعد",
} as const;

const proofStatusLabels = {
  available: "متاح",
  verification: "قيد المراجعة",
  later: "يُنشر بعد اعتماده",
  unavailable: "غير متاح حاليًا",
} as const;

function ProjectHeroMedia({ project }: { project: ProjectRecord }) {
  if (project.image) {
    return (
      <figure className="project-detail-hero-media">
        <img src={project.image.sourceUrl} alt={project.image.alt.ar} />
      </figure>
    );
  }
  return null;
}

export function ProjectDetailExperience({
  project,
  detail,
  metric,
  relatedProjects,
  faqs,
}: {
  project: ProjectRecord;
  detail: ResolvedProjectDetail;
  metric?: ProjectMetric;
  relatedProjects: ProjectRecord[];
  faqs: { question: string; answer: string }[];
}) {
  const urgent = project.tags.includes("emergency") || project.tags.includes("urgent");

  return (
    <main id="main-content" className="project-detail-page">
      <div className="site-container">
        <nav className="project-breadcrumb" aria-label="مسار الصفحة">
          <a href="/">الرئيسية</a><span aria-hidden="true">←</span><a href="/projects">المشاريع</a><span aria-hidden="true">←</span><span aria-current="page">{project.title.ar}</span>
        </nav>

        <div className="project-detail-shell">
          <div className="project-detail-primary">
            <section className="project-detail-hero" aria-labelledby="project-title">
              <ProjectHeroMedia project={project} />
              <div className="project-detail-hero-copy">
                <div className="project-detail-badges">
                  <span>مشروع منبر الأقصى</span><b>{regionLabels[project.region]}</b><i>{urgent ? "عاجل" : statusLabels[project.status]}</i>
                </div>
                <h1 id="project-title">{project.title.ar}</h1>
                <p>{project.summary.ar}</p>
                <div className="project-detail-donation-types">{project.donationTypes.map((type) => <span key={type}>{donationLabels[type]}</span>)}</div>
                {project.image ? <div className="project-proof-line"><span aria-hidden="true" /><strong>صورة ميدانية للمشروع</strong></div> : null}
                {detail.isFallback ? <p className="fallback-detail-label">تُضاف التفاصيل والتقارير بعد مراجعتها.</p> : null}
              </div>
            </section>

            <ProjectAnchorNavigation />

            <section id="story" className="project-editorial-section project-story" aria-labelledby="story-title">
              <div className="project-section-heading"><span>عن المشروع</span><h2 id="story-title">لماذا نعمل على هذا المشروع؟</h2></div>
              <div className="project-story-layout">
                <div className="project-story-copy">{detail.story.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}<blockquote>{detail.highlight}</blockquote></div>
                <div className="project-story-facts">
                  <div><span>الاحتياج</span><strong>{detail.need}</strong></div>
                  <div><span>ماذا يقدم المشروع؟</span><strong>{detail.goal}</strong></div>
                  <div><span>مكان التنفيذ</span><strong>{detail.location}</strong></div>
                  <div><span>الحالة الحالية</span><strong>{detail.currentStage}</strong></div>
                </div>
              </div>
            </section>

            <section id="impact-plan" className="project-editorial-section project-impact-plan" aria-labelledby="impact-plan-title">
              <div className="project-section-heading"><span>كيف يصل تبرعك؟</span><h2 id="impact-plan-title">مراحل تنفيذ المشروع</h2><p>توضح هذه الخطوات ما يحدث بعد التبرع.</p></div>
              <ol className="impact-plan-steps">{detail.impactPlan.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong></li>)}</ol>
              <div className="beneficiary-strip"><span>من المستفيد؟</span>{detail.beneficiaries?.length ? <div>{detail.beneficiaries.map((item) => <strong key={item}>{item}</strong>)}</div> : <p>تُحدد الفئات المستفيدة حسب احتياج المشروع.</p>}</div>
            </section>

            <section id="updates" className="project-editorial-section project-updates" aria-labelledby="updates-title">
              <div className="project-section-heading"><span>تحديثات المشروع</span><h2 id="updates-title">آخر ما نُشر</h2></div>
              {detail.updates.length ? (
                <ol className="project-update-timeline">{detail.updates.map((update) => <li key={update.id}><div className="update-marker" aria-hidden="true" /><article><div className="update-meta"><span>{update.dateLabel}</span><b>{update.stage}</b><i>{updateStatusLabels[update.status]}</i></div><h3>{update.title}</h3><p>{update.description}</p>{update.mediaLabel ? <div className="update-media-placeholder">{update.mediaLabel}</div> : null}<small>المصدر: {update.sourceLabel}</small></article></li>)}</ol>
              ) : <div className="project-updates-empty"><h3>لا توجد تحديثات منشورة حاليًا</h3><p>ستظهر التحديثات هنا بعد مراجعتها واعتمادها.</p></div>}
            </section>

            <section id="proof" className="project-editorial-section project-proof" aria-labelledby="proof-title">
              <div className="project-section-heading"><span>تقارير المشروع</span><h2 id="proof-title">التقارير والوثائق المتاحة</h2></div>
              <div className="project-proof-layout">
                <div className="project-proof-list">{detail.proofItems.map((item) => <article key={item.label}><span aria-hidden="true" /><div><h3>{item.label}</h3><strong>{proofStatusLabels[item.status]}</strong><p>{item.note}</p></div></article>)}</div>
                <aside className="project-document-preview" aria-label="التقارير الميدانية"><span>التقارير الميدانية</span><h3>ننشر التقارير بعد اعتمادها</h3><p>يظهر كل تقرير هنا بعد مراجعته وربطه بالمشروع.</p><a href="/impact">عرض التقارير والتحديثات</a></aside>
              </div>
            </section>

            {project.image ? <section id="media" className="project-editorial-section project-media" aria-labelledby="media-title"><div className="project-section-heading"><span>من الميدان</span><h2 id="media-title">صور المشروع</h2></div><figure className="project-media-feature"><img src={project.image.sourceUrl} alt={project.image.alt.ar} loading="lazy" /></figure></section> : null}

            <section id="faq" className="project-editorial-section project-faq" aria-labelledby="faq-title"><div className="project-section-heading"><span>معلومات مهمة</span><h2 id="faq-title">أسئلة شائعة</h2></div><ProjectFaq items={faqs} /></section>

            <section className="project-editorial-section related-projects" aria-labelledby="related-title">
              <div className="project-section-heading"><span>مشاريع أخرى</span><h2 id="related-title">مشاريع يمكنك دعمها</h2></div>
              <div className="related-projects-grid">{relatedProjects.map((related) => <article key={related.id}><a className="related-project-media" href={`/projects/${related.slug}`} aria-label={`عرض مشروع ${related.title.ar}`}>{related.image ? <img src={related.image.sourceUrl} alt={related.image.alt.ar} loading="lazy" /> : <span>{regionLabels[related.region]}</span>}</a><div><small>{regionLabels[related.region]}</small><h3><a href={`/projects/${related.slug}`}>{related.title.ar}</a></h3><div>{related.donationTypes.map((type) => <span key={type}>{donationLabels[type]}</span>)}</div><Button href={`/projects/${related.slug}`} variant="outline" size="small">عرض المشروع</Button></div></article>)}</div>
            </section>
          </div>

          <div className="project-donation-column"><ProjectDonationPanel project={project} metric={metric} suggestedAmounts={detail.suggestedAmounts} acceptsGift={detail.acceptsGift} /></div>
        </div>
      </div>
    </main>
  );
}
