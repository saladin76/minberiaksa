import { ProjectFaq } from "@/components/project-detail/project-faq";
import { AlQudsGoldCoin } from "@/components/brand/al-quds-gold-coin";
import { GoldenIdentityPattern } from "@/components/brand/golden-identity-pattern";
import { GoldenSectionDivider } from "@/components/brand/golden-section-divider";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import type { ProjectMetric } from "@/data/project-metrics";
import type { ProjectRecord, ProjectRegion, ProjectStatus } from "@/data/projects";
import {
  zakatDistributionSteps,
  zakatFaqs,
  zakatProofItems,
  zakatSeparationItems,
  zakatTrustItems,
} from "@/data/zakat";
import { ZakatCalculator } from "./zakat-calculator";

const regionLabels: Record<ProjectRegion, string> = {
  "al-quds": "القدس",
  "al-aqsa": "الأقصى",
  gaza: "غزة",
  syria: "سوريا",
  sudan: "السودان",
  yemen: "اليمن",
  global: "مشاريع عامة",
};

const statusLabels: Record<ProjectStatus, string> = {
  active: "متاح للدعم",
  seasonal: "موسمي",
  archived: "مكتمل",
  "needs-verification": "قيد المراجعة",
};

function ProjectMedia({ project }: { project: ProjectRecord }) {
  if (project.image) {
    return <figure className="z-project-media"><img src={project.image.sourceUrl} alt={project.image.alt.ar} loading="lazy" /></figure>;
  }

  return <div className="z-placeholder"><span>{regionLabels[project.region]}</span><strong>{project.title.ar}</strong></div>;
}

export function ZakatPageSections({ projects }: { projects: ProjectRecord[]; metrics: ProjectMetric[] }) {
  const choices = projects.map((project) => ({ id: project.id, slug: project.slug, title: project.title.ar }));

  return (
    <>
      <div className="z-breadcrumb">
        <Container><nav aria-label="مسار التنقل"><a href="/">الرئيسية</a><span>←</span><span aria-current="page">الزكاة</span></nav></Container>
      </div>

      <section className="z-hero z-hero--golden" aria-labelledby="z-hero-title">
        <GoldenIdentityPattern />
        <Container className="z-hero-grid">
          <div className="z-hero-copy">
            <span className="z-kicker">زكاة واضحة المسار لفلسطين</span>
            <h1 id="z-hero-title">احسب زكاتك، ثم وجّهها بثقة.</h1>
            <p>ابدأ بحساب تقديري، ثبّت نيتك، ثم اختر صندوق الزكاة أو مشروعًا مؤهلًا ضمن مسار مستقل عن الصدقة والوقف.</p>
            <div className="z-actions">
              <Button href="#zakat-calculator" size="large">احسب زكاتك</Button>
              <Button href="#zakat-projects" variant="outline" size="large">استكشف المشاريع المؤهلة</Button>
            </div>
            <ul>
              <li>نية مستقلة</li>
              <li>مشروعات مؤهلة فقط</li>
              <li>خصوصية بيانات الحاسبة</li>
              <li>مراجعة قبل الإتمام</li>
            </ul>
            <div className="z-warning"><strong>الحاسبة تقديرية ولا تُعد فتوى شرعية</strong><span>تحقق من النصاب وحولان الحول وفق حالتك.</span></div>
          </div>
          <div className="z-hero-visual z-hero-visual--coin">
            <AlQudsGoldCoin priority />
            <ol><li>احسب</li><li>ثبّت النية</li><li>اختر المسار</li><li>راجع وأتم</li></ol>
          </div>
        </Container>
      </section>

      <Container><ZakatCalculator projects={choices} /></Container>

      <section className="z-separation">
        <Container>
          <header><span>فصل الأموال والنية</span><h2>زكاتك تبقى في مسار مستقل</h2><p>تُعامل الزكاة كنية ومسار توزيع مستقلين، ولا تختلط بالصدقة أو الوقف داخل السلة.</p></header>
          <ol>{zakatSeparationItems.map(([number, title, description]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></li>)}</ol>
        </Container>
      </section>

      <section className="z-distribution z-editorial">
        <Container>
          <div className="z-editorial-copy"><GoldenSectionDivider label="مسار التوزيع" /><h2>كيف تُوجّه زكاتك؟</h2><p>تمر الزكاة من تأكيد النية إلى اختيار المسار ثم مراجعة المبلغ قبل إتمام العملية.</p></div>
          <ol>{zakatDistributionSteps.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong></li>)}</ol>
        </Container>
      </section>

      <section className="z-projects" id="zakat-projects">
        <Container>
          <header><span>مشاريع مؤهلة فقط</span><h2>اختر وجهة زكاتك</h2><p>تظهر هنا فقط المشاريع المسجلة داخل البيانات على أنها تقبل الزكاة.</p></header>
          <div className="z-project-grid">
            {projects.slice(0, 3).map((project) => (
              <article key={project.id}>
                <ProjectMedia project={project} />
                <div>
                  <small>{regionLabels[project.region]} · {statusLabels[project.status]}</small>
                  <h3>{project.title.ar}</h3>
                  <p>{project.summary.ar}</p>
                  <div className="z-proof-line"><span aria-hidden="true" />{project.image ? "صورة ميدانية مرتبطة بالمشروع" : "الوسائط تُضاف بعد اعتمادها"}</div>
                  <footer>
                    <Button href={`/projects/${project.slug}`} variant="outline">عرض المشروع</Button>
                    <Button href="#zakat-calculator" variant="ghost">وجّه زكاتك</Button>
                  </footer>
                </div>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="z-proof">
        <Container>
          <header><span>الشفافية</span><h2>ما الذي نوثقه في مسار الزكاة؟</h2><p>تظهر حالة كل عنصر بوضوح، ولا نعرض إيصالًا أو تقريرًا قبل توفره واعتماده.</p></header>
          <div className="z-proof-grid">
            <div>
              {zakatProofItems.map(([title, status, note]) => (
                <article key={title}><span aria-hidden="true" /><div><h3>{title}</h3><strong>{status}</strong><p>{note}</p></div></article>
              ))}
            </div>
            <aside>
              <span>بعد إتمام العملية</span>
              <h3>ملخص واضح لزكاتك</h3>
              <p>يظهر المبلغ والعملة والنية والمشروع أو الصندوق الذي اخترته داخل سجل التبرع.</p>
              <a href="/account/donations">استعرض سجل التبرعات</a>
            </aside>
          </div>
        </Container>
      </section>

      <section className="z-sharia">
        <Container>
          <div><span>تنبيه شرعي</span><h2>الحساب لا يغني عن السؤال الشرعي</h2><p>الحاسبة تساعدك على التقدير فقط. الحالات الخاصة تحتاج مراجعة جهة شرعية موثوقة.</p></div>
          <div className="z-sharia-guidance"><strong>تحقق قبل الإخراج من:</strong><ul><li>بلوغ النصاب</li><li>حولان الحول</li><li>نوع المال الزكوي</li><li>الديون والالتزامات المعتبرة</li></ul></div>
        </Container>
      </section>

      <section className="z-faq">
        <Container><header><span>قبل إتمام الزكاة</span><h2>الأسئلة الشائعة</h2></header><ProjectFaq items={[...zakatFaqs]} /></Container>
      </section>

      <section className="z-trust z-trust--final" aria-label="مبادئ تجربة الزكاة">
        <Container>{zakatTrustItems.map(([title, description], index) => <div key={title}><span>0{index + 1}</span><strong>{title}</strong><p>{description}</p></div>)}</Container>
      </section>

      <section className="z-final">
        <Container>
          <div><span>نية واضحة · مسار مستقل</span><h2>ابدأ بالحساب، ثم اختر وجهة زكاتك</h2><p>تظل تفاصيل أموالك داخل الحاسبة، ويُضاف إلى السلة المبلغ والمسار فقط.</p></div>
          <Button href="#zakat-calculator" size="large">ابدأ الحساب التقديري</Button>
        </Container>
      </section>
    </>
  );
}