import { Button } from "@/components/ui/button";
import { ProjectFaq } from "@/components/project-detail/project-faq";
import { AlQudsGoldCoin } from "@/components/brand/al-quds-gold-coin";
import { GoldenIdentityPattern } from "@/components/brand/golden-identity-pattern";
import { RecurringManagementPreview, RecurringPlanBuilder, RecurringProjectSelectButton } from "./recurring-plan-builder";
import { recurringFaq, recurringHowItWorks, recurringImpactSteps, recurringRhythm } from "@/data/recurring";
import type { ProjectRecord } from "@/data/projects";

const region = (value: string) => value === "gaza" ? "غزة" : value === "al-quds" ? "القدس" : value === "al-aqsa" ? "الأقصى" : "مشروع رسمي";

export function RecurringExperience({ projects }: { projects: ProjectRecord[] }) {
  const featured = projects.find((project) => project.image) || projects[0];

  return (
    <main id="main-content" className="recurring-page recurring-page--golden">
      <div className="site-container"><nav className="recurring-breadcrumb" aria-label="مسار التنقل"><a href="/">الرئيسية</a><span aria-hidden="true">←</span><span aria-current="page">العطاء المستمر</span></nav></div>

      <section className="recurring-hero recurring-hero--golden">
        <GoldenIdentityPattern />
        <div className="site-container recurring-hero-grid recurring-hero-grid--builder">
          <div className="recurring-hero-copy">
            <span className="recurring-eyebrow">عطاء يتجدد</span>
            <h1>عطاؤك المستمر<br />يصنع أثرًا لا يتوقف.</h1>
            <p>اختر الدورية والجهة والمبلغ، ثم راجع تقدير خطتك قبل المتابعة إلى السلة وإتمام العملية.</p>
            <ul><li>يومي</li><li>كل جمعة</li><li>شهري</li><li>مراجعة واضحة قبل التأكيد</li></ul>
            <div className="recurring-coin-plant">
              {featured?.image ? <img src={featured.image.sourceUrl} alt={featured.image.alt.ar} /> : null}
              <AlQudsGoldCoin decorative />
            </div>
          </div>
          <div id="recurring-plan-builder" className="recurring-hero-builder">
            <div className="recurring-section-heading"><span>خطتك المرنة</span><h2>أنشئ خطة عطائك المستمر</h2><p>اختر الدورية والجهة والمبلغ وتاريخ البداية، ثم راجع الملخص.</p></div>
            <RecurringPlanBuilder projects={projects} />
          </div>
        </div>
      </section>

      <section className="recurring-rhythm" aria-label="مسار العطاء المستمر"><div className="site-container">{recurringRhythm.map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong>{index < recurringRhythm.length - 1 ? <b aria-hidden="true">←</b> : null}</div>)}</div></section>

      <section className="recurring-section recurring-impact">
        <div className="site-container"><div className="recurring-section-heading"><span>ما هو العطاء المستمر؟</span><h2>خطة بسيطة تتكرر وفق اختيارك</h2><p>تحدد قيمة كل عملية والدورية والجهة، وتراجع التقدير الشهري والسنوي قبل التأكيد.</p></div><ol>{recurringImpactSteps.map(([title, text], index) => <li key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol></div>
      </section>

      <section id="recurring-projects" className="recurring-section recurring-projects recurring-project-journey">
        <div className="site-container"><div className="recurring-section-heading"><span>وجهات العطاء</span><h2>مشاريع يخدمها عطاؤك المستمر</h2><p>تظهر المشروعات المسجلة ضمن نوع العطاء المستمر فقط.</p></div><div className="recurring-project-orbit" role="list">{projects.slice(0, 5).map((project) => <article key={project.id} role="listitem">{project.image ? <img src={project.image.sourceUrl} alt={project.image.alt.ar} loading="lazy" /> : <div className="recurring-project-placeholder"><span>{region(project.region)}</span><strong>{project.title.ar}</strong></div>}<div><small>{region(project.region)} · {project.status === "active" ? "متاح للدعم" : "قيد المراجعة"}</small><h3>{project.title.ar}</h3><p>{project.summary.ar}</p><span className="recurring-proof"><i aria-hidden="true" />{project.image ? "صورة ميدانية مرتبطة بالمشروع" : "الوسائط تُضاف بعد اعتمادها"}</span><div><Button href={`/projects/${project.slug}`} variant="text" size="small">عرض المشروع</Button><RecurringProjectSelectButton id={project.id} /></div></div></article>)}</div></div>
      </section>

      <section className="recurring-section recurring-how">
        <div className="site-container"><div className="recurring-section-heading"><span>خطوات واضحة</span><h2>كيف تبدأ خطتك؟</h2></div><ol>{recurringHowItWorks.map((item, index) => <li key={item}><b>{index + 1}</b><span>{item}</span></li>)}</ol><p>تظهر كل تفاصيل الدورية والمبلغ والجهة قبل تأكيد العملية.</p></div>
      </section>

      <section className="recurring-section recurring-management">
        <div className="site-container recurring-two-column"><div><div className="recurring-section-heading"><span>إدارة الخطة</span><h2>خطتك تبقى واضحة داخل حسابك</h2><p>يظهر سجل الخطة والعمليات والوجهة في مساحة واحدة بعد تفعيل النظام التشغيلي.</p></div><RecurringManagementPreview /></div><aside className="recurring-plan-record"><span>ما الذي يرتبط بالخطة؟</span><h3>سجل منظم لكل عملية</h3><ul><li>الدورية والمبلغ</li><li>الجهة أو المشروع</li><li>تاريخ كل عملية</li><li>التحديثات والتقارير المتاحة</li></ul><Button href="/account/recurring" variant="outline">صفحة الخطط المستمرة</Button></aside></div>
      </section>

      <section className="recurring-section recurring-flexibility">
        <div className="site-container"><div className="recurring-section-heading"><span>ثقة ومرونة</span><h2>لا التزام مخفي داخل الخطة</h2></div><div>{["قيمة كل عملية ظاهرة قبل التأكيد.", "الدورية والجهة واضحتان في الملخص.", "لا يتغير المبلغ دون إجراء من صاحب الحساب.", "ترتبط العمليات والتحديثات بالخطة نفسها."].map((item) => <p key={item}>✓ {item}</p>)}</div><small>تُعرض سياسات الإلغاء والاسترداد والدفع المتكرر بعد اعتمادها قانونيًا وتشغيليًا.</small></div>
      </section>

      <section className="recurring-section recurring-faq"><div className="site-container"><div className="recurring-section-heading"><span>قبل البدء</span><h2>الأسئلة الشائعة</h2></div><ProjectFaq items={recurringFaq} /></div></section>

      <section className="recurring-final"><div className="site-container"><div><span>ابدأ بخطوة بسيطة</span><h2>اختر خطة تناسبك<br />ودع أثرها يستمر</h2></div><div><Button href="#recurring-plan-builder" size="large">أنشئ خطة عطاء</Button><Button href="/#donate" variant="outline" size="large">تبرع لمرة واحدة</Button></div></div></section>
    </main>
  );
}