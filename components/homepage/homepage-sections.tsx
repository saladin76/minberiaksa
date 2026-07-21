import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { projects } from "@/data/projects";
import { knowledge, stories } from "@/data/homepage";
import {
  FundsSelector,
  QuickDonation,
  RecurringGivingTool,
  ReelsExperience,
  WaqfBuilder,
  ZakatCalculator,
} from "./homepage-interactions";

const regionLabels: Record<string, string> = {
  gaza: "غزة",
  "al-quds": "القدس",
  "al-aqsa": "الأقصى",
  syria: "سوريا",
  sudan: "السودان",
  yemen: "اليمن",
  global: "مشاريع عامة",
};

const featuredProjects = projects.filter((project) => project.featured).slice(0, 3);
const heroProject = featuredProjects.find((project) => project.image) ?? projects.find((project) => project.image);

function ProjectImage({ project, className = "" }: { project: (typeof projects)[number]; className?: string }) {
  return project.image ? (
    <img className={className} src={project.image.sourceUrl} alt={project.image.alt.ar} loading="lazy" />
  ) : (
    <div className={`project-image-fallback ${className}`} role="img" aria-label={`صورة ${project.title.ar} قيد الإضافة`}>
      <span>{regionLabels[project.region] ?? "فلسطين"}</span>
    </div>
  );
}

export function ImpactStories() {
  return (
    <section className="stories-section" aria-label="مسارات المؤسسة">
      <Container>
        <div className="stories-strip">
          {stories.map(([title, status, tone]) => (
            <a href="/stories" className="story-item" key={title}>
              <span className={`story-thumb story-thumb--${tone}`} aria-hidden="true" />
              <strong>{title}</strong>
              <small>{status}</small>
            </a>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function HomepageHero() {
  return (
    <section className="homepage-hero" id="top" aria-labelledby="hero-title">
      <Container className="homepage-hero-grid">
        <div className="homepage-hero-copy">
          <span className="hero-kicker">من القدس والأقصى وغزة</span>
          <h1 id="hero-title">عطاء واضح.<br />مشروع موثّق.<br />أثر يمكن متابعته.</h1>
          <p>اختر مشروعك أو نية عطائك، ثم تابع مسار المساهمة من التسجيل إلى التنفيذ والتحديثات الميدانية.</p>
          <div className="hero-actions">
            <Button href="#donate" size="large">ابدأ التبرع</Button>
            <Button href="/projects" variant="outline" size="large">استكشف المشاريع</Button>
          </div>
          <ul className="hero-trust-list">
            <li>زكاة مستقلة</li>
            <li>شهادة وقف</li>
            <li>تحديثات ميدانية</li>
          </ul>
        </div>
        <div className="hero-visual">
          {heroProject ? <ProjectImage project={heroProject} className="hero-field-image" /> : null}
          <aside className="field-update">
            <span>من الميدان</span>
            <h2>{heroProject?.title.ar ?? "مشاريع منبر الأقصى"}</h2>
            <div><b>{heroProject ? regionLabels[heroProject.region] : "فلسطين"}</b><a href={heroProject ? `/projects/${heroProject.slug}` : "/projects"}>عرض المشروع</a></div>
          </aside>
        </div>
      </Container>
    </section>
  );
}

export function OfficialProjects() {
  return (
    <section className="home-section official-projects" id="projects" aria-labelledby="projects-title">
      <Container>
        <div className="section-heading-row">
          <div><span className="section-eyebrow">مشاريع من الميدان</span><h2 id="projects-title">اختر مشروعًا واضح الهدف</h2><p>تعرف على الاحتياج، وطريقة التنفيذ، وحالة المشروع قبل اتخاذ قرار التبرع.</p></div>
          <Button href="/projects" variant="outline">عرض جميع المشاريع</Button>
        </div>
        <div className="projects-showcase">
          {featuredProjects.map((project, index) => (
            <article className={index === 0 ? "project-featured" : "project-secondary"} key={project.id}>
              <ProjectImage project={project} />
              <div className="project-content">
                <div className="project-meta"><span>{regionLabels[project.region]}</span><b>{project.donationTypes.includes("zakat") ? "يقبل الزكاة" : "تبرع عام"}</b></div>
                <h3>{project.title.ar}</h3>
                <p>{project.summary.ar}</p>
                <div className="project-proof-line"><span>الحالة</span><strong>{project.status === "active" ? "متاح للدعم" : "يحتاج مراجعة"}</strong></div>
                <div className="project-actions"><Button href={`/projects/${project.slug}`}>عرض المشروع</Button><Button href="#donate" variant="text">تبرع سريع</Button></div>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function MinberFunds() { return <section className="home-section funds-section" aria-labelledby="funds-title"><Container><div className="section-heading-row"><div><span className="section-eyebrow">مسارات العطاء</span><h2 id="funds-title">اختر نيتك قبل المبلغ</h2><p>وجّه عطائك إلى الزكاة أو الوقف أو الإغاثة أو حيث الحاجة أشد.</p></div></div><FundsSelector /></Container></section>; }
export function ZakatGateway() { return <section className="home-section zakat-section" id="zakat" aria-labelledby="zakat-title"><Container><div className="gateway-heading"><span>مسار مستقل للزكاة</span><h2 id="zakat-title">احسب زكاتك تقديريًا<br />ثم وجّهها بثقة</h2><p>تحافظ التجربة على نية الزكاة مستقلة وتعرض المشاريع المؤهلة لها فقط.</p><Button href="/zakat" variant="outline">صفحة الزكاة</Button></div><ZakatCalculator /></Container></section>; }
export function WaqfGateway() { return <section className="home-section waqf-section" id="waqf" aria-labelledby="waqf-title"><Container><div className="gateway-heading"><span>أثر ممتد</span><h2 id="waqf-title">وقف للقدس<br />يبقى أثره</h2><p>حدّد صاحب الوقف، واختر المشروع، وشاهد شكل الشهادة قبل المتابعة.</p><Button href="/waqf" variant="outline">مشاريع الوقف</Button></div><WaqfBuilder /></Container></section>; }
export function RecurringGiving() { return <section className="home-section recurring-section" id="recurring" aria-labelledby="recurring-title"><Container><div className="gateway-heading"><span>عطاء منتظم</span><h2 id="recurring-title">يوميًا أو كل جمعة<br />أو شهريًا</h2><p>اختر الإيقاع الذي يناسبك والمشروع الذي ترغب في دعمه باستمرار.</p><Button href="/recurring" variant="outline">أنشئ خطة عطاء</Button></div><RecurringGivingTool /></Container></section>; }
export function ImpactReels() { return <section className="home-section reels-section" id="impact" aria-labelledby="reels-title"><Container><div className="section-heading-row"><div><span className="section-eyebrow">من الميدان</span><h2 id="reels-title">قصص مرتبطة بالمشروعات</h2><p>صور وفيديوهات وتحديثات تظهر سياق التنفيذ، لا محتوى ترفيهيًا منفصلًا.</p></div><Button href="/stories" variant="outline">عرض القصص</Button></div><ReelsExperience /></Container></section>; }

export function ImpactStats() {
  const items = [
    ["مشاريع مرتبطة", "كل تحديث يعود إلى مشروع واضح"],
    ["حالة التوثيق", "متاح أو قيد المراجعة أو مطلوب"],
    ["رحلة التنفيذ", "من الاحتياج إلى التقرير"],
    ["وثائق المتبرع", "إيصال أو شهادة حسب نية العطاء"],
  ];
  return <section className="home-section stats-section" aria-labelledby="stats-title"><Container><div className="stats-intro"><span className="section-eyebrow">الشفافية أولًا</span><h2 id="stats-title">لا نعرض رقمًا بلا مصدر</h2><p>تعرض المنصة حالة كل تقرير ووثيقة وتحديث بدل تقديم مؤشرات غير معتمدة.</p><Button href="/impact" variant="outline">مركز الأثر والتقارير</Button></div><div className="stats-list">{items.map(([title, text], index) => <div key={title}><span>0{index + 1}</span><strong>{title}</strong><p>{text}</p></div>)}</div></Container></section>;
}

export function TrustProof() {
  const docs = ["إيصال التبرع", "إيصال الزكاة", "شهادة الوقف", "التحديث الميداني", "تقرير المشروع"];
  return <section className="home-section trust-section" aria-labelledby="trust-title"><Container><div className="section-heading-row"><div><span className="section-eyebrow">رحلة موثّقة</span><h2 id="trust-title">من نية العطاء إلى أثر المشروع</h2></div></div><div className="trust-layout"><div className="document-preview"><span>وثائق المتبرع</span><h3>كل نية لها مسارها</h3><p>تبقى الزكاة والوقف والتبرعات العامة منفصلة داخل السلة والإيصال والمتابعة.</p><Button href="/impact" variant="outline">شاهد رحلة الأثر</Button></div><div className="document-list">{docs.map((item, index) => <div key={item}><span>0{index + 1}</span><strong>{item}</strong><small>يظهر عند توفره واعتماده</small></div>)}</div></div></Container></section>;
}

export function KnowledgeCenter() {
  const links = ["/knowledge/estimate-your-zakat", "/knowledge/waqf-versus-charity", "/knowledge/continuous-giving-plan", "/knowledge/follow-project-reports", "/knowledge"];
  return <section className="home-section knowledge-section" id="knowledge" aria-labelledby="knowledge-title"><Container><div className="section-heading-row"><div><span className="section-eyebrow">مركز المعرفة</span><h2 id="knowledge-title">اعرف قبل أن تعطي</h2></div><Button href="/knowledge" variant="outline">عرض جميع الأدلة</Button></div><div className="knowledge-layout"><article className="knowledge-featured"><span>دليل الزكاة</span><h3>{knowledge[0]}</h3><p>شرح مبسّط للنية والحساب التقديري ومسار التوثيق.</p><a href={links[0]}>اقرأ الدليل</a></article><div className="knowledge-list">{knowledge.slice(1).map((item, index) => <article key={item}><span>0{index + 2}</span><h3>{item}</h3><a href={links[index + 1]}>اقرأ المقال</a></article>)}</div></div></Container></section>;
}

export function SoftGateway() { return <section className="home-section soft-gateway" id="about" aria-labelledby="soft-title"><Container><div><span className="section-eyebrow">اختر خطوتك التالية</span><h2 id="soft-title">استكشف المشروع، ثم اتخذ قرارك</h2><p>ابدأ بالمشاريع أو تعرف على الوقف والزكاة والعطاء المستمر.</p></div><div className="soft-links"><a href="/projects"><strong>استكشف المشاريع</strong><span>حسب المنطقة ونوع الأثر</span></a><a href="/zakat"><strong>احسب زكاتك</strong><span>تقدير واضح ومسار مستقل</span></a><a href="/waqf"><strong>أنشئ وقفًا</strong><span>لصاحب الوقف أو إهداءً لمن تحب</span></a></div></Container></section>; }

export { QuickDonation };
