import { PatternBackground } from "@/components/brand/pattern-background";
import { ProjectsCarousel } from "@/components/projects/projects-carousel";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { projects } from "@/data/projects";
import { knowledge, stories } from "@/data/homepage";
import {
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
  global: "فلسطين والعالم",
};

const featuredProjects = projects.filter((project) => project.featured).slice(0, 6);
const homepageProjects = featuredProjects.length >= 3
  ? featuredProjects
  : projects.filter((project) => project.status === "active").slice(0, 6);
const heroProject = featuredProjects.find((project) => project.image) ?? projects.find((project) => project.image);

function ProjectImage({ project, className = "" }: { project: (typeof projects)[number]; className?: string }) {
  return project.image ? (
    <img
      className={className}
      src={project.image.sourceUrl}
      alt={project.image.alt.ar}
      width={1400}
      height={1000}
      loading="eager"
      decoding="async"
      style={{ objectPosition: project.slug === "gaza-food-parcels" ? "50% 34%" : "50% 42%" }}
    />
  ) : (
    <div className={`project-image-fallback ${className}`} role="img" aria-label={`${regionLabels[project.region] ?? "فلسطين"}: ${project.title.ar}`}>
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
          <span className="hero-kicker">من القدس والأقصى وغزة إلى العالم</span>
          <h1 id="hero-title">اجعل أثر عطائك واضحًا في القدس والأقصى وغزة</h1>
          <p>اختر نية عطائك، ثم تابع مساهمتك من الإيصال إلى تحديثات الأثر.</p>
          <div className="hero-actions">
            <Button href="#donate" size="large">ابدأ التبرع</Button>
            <Button href="/projects" variant="outline" size="large">استكشف المشاريع</Button>
          </div>
          <ul className="hero-trust-list">
            <li>مسارات مستقلة للزكاة والوقف</li>
            <li>سلة عطاء واحدة وواضحة</li>
            <li>تحديثات مرتبطة بالمشروع</li>
          </ul>
        </div>

        <div className="hero-visual">
          {heroProject ? <ProjectImage project={heroProject} className="hero-field-image" /> : null}
          <aside className="field-update">
            <span>مشروع ميداني متاح</span>
            <h2>{heroProject?.title.ar ?? "مشاريع منبر الأقصى"}</h2>
            <div><b>{heroProject ? regionLabels[heroProject.region] : "فلسطين"}</b><a href={heroProject ? `/projects/${heroProject.slug}` : "/projects"}>عرض المشروع</a></div>
          </aside>
        </div>
      </Container>
    </section>
  );
}

export function GivingIntentNavigation() {
  const intents = [
    { label: "زكاة", description: "مسار مستقل لحفظ النية", href: "/zakat", tone: "zakat", number: "01" },
    { label: "وقف", description: "أثر ممتد للقدس والأقصى", href: "/waqf", tone: "waqf", number: "02" },
    { label: "عطاء مستمر", description: "يومي أو كل جمعة أو شهري", href: "/recurring", tone: "recurring", number: "03" },
    { label: "إغاثة عاجلة", description: "استجابة للاحتياجات الأشد", href: "/projects?intent=relief", tone: "relief", number: "04" },
    { label: "مشاريع القدس", description: "ترميم وتعليم ورعاية أسر", href: "/projects?region=al-quds", tone: "quds", number: "05" },
    { label: "مشاريع غزة", description: "غذاء ومياه وإغاثة", href: "/projects?region=gaza", tone: "gaza", number: "06" },
  ];

  return (
    <section className="home-section giving-intents-section" aria-labelledby="giving-intents-title">
      <Container>
        <div className="section-heading-row">
          <div>
            <span className="section-eyebrow">ابدأ من نيتك</span>
            <h2 id="giving-intents-title">اختر مسار العطاء قبل اختيار المبلغ</h2>
            <p>كل مسار يقودك إلى المشاريع والأدوات المناسبة دون خلط بين الزكاة والوقف والإغاثة والعطاء المستمر.</p>
          </div>
        </div>
        <div className="giving-intent-nav">
          {intents.map((intent) => (
            <a className={`giving-intent-row giving-intent-row--${intent.tone}`} href={intent.href} key={intent.label}>
              <span>{intent.number}</span>
              <div><strong>{intent.label}</strong><small>{intent.description}</small></div>
              <b aria-hidden="true">←</b>
            </a>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function OfficialProjects() {
  return (
    <PatternBackground intensity="soft" position="full" fadeDirection="both" variant="section" tone="home" className="home-projects-carousel-section">
      <section className="home-section project-carousel-showcase" id="projects" aria-labelledby="projects-title">
        <Container>
          <div className="section-heading-row">
            <div>
              <span className="section-eyebrow">مشاريع ميدانية متاحة للعطاء</span>
              <h2 id="projects-title">اختر المشروع الأقرب إلى نية عطائك</h2>
              <p>استعرض المشاريع المتاحة وتعرّف على الاحتياج ومسار التنفيذ قبل إتمام مساهمتك.</p>
            </div>
            <Button href="/projects" variant="outline">عرض جميع المشاريع</Button>
          </div>
          <ProjectsCarousel projects={homepageProjects} />
        </Container>
      </section>
    </PatternBackground>
  );
}

export function DonationJourney() {
  const steps = [
    ["01", "اختر نية عطائك", "زكاة أو وقف أو إغاثة أو عطاء مستمر."],
    ["02", "اختر المشروع أو التخصيص", "راجع الاحتياج والمنطقة ومسار التنفيذ."],
    ["03", "أتمم المساهمة", "راجع عناصر السلة وبياناتك قبل التأكيد."],
    ["04", "تابع الإيصال والأثر", "ارجع إلى حسابك وتقارير المشروع عند توفرها."],
  ];

  return (
    <section className="home-section donation-journey-section" aria-labelledby="journey-title">
      <Container>
        <div className="section-heading-row">
          <div>
            <span className="section-eyebrow">رحلة عطاء واحدة</span>
            <h2 id="journey-title">من النية إلى متابعة الأثر</h2>
            <p>تجربة واضحة تحافظ على نوع مساهمتك وتربطها بالمشروع والوثائق المتاحة.</p>
          </div>
        </div>
        <ol className="donation-journey">
          {steps.map(([number, title, text], index) => (
            <li key={number}>
              <span>{number}</span>
              <div><strong>{title}</strong><p>{text}</p></div>
              {index < steps.length - 1 ? <i aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export function ZakatGateway() {
  return <PatternBackground variant="directional" tone="zakat" position="top" fadeDirection="bottom"><section className="home-section zakat-section" id="zakat" aria-labelledby="zakat-title"><Container><div className="gateway-heading"><span>مسار مستقل للزكاة</span><h2 id="zakat-title">احسب زكاتك تقديريًا<br />ثم وجّهها بثقة</h2><p>تحافظ التجربة على نية الزكاة مستقلة وتعرض المشاريع المؤهلة لها فقط.</p><Button href="/zakat" variant="outline">صفحة الزكاة</Button></div><ZakatCalculator /></Container></section></PatternBackground>;
}

export function WaqfGateway() {
  return <PatternBackground variant="directional" tone="waqf" position="top" fadeDirection="bottom"><section className="home-section waqf-section" id="waqf" aria-labelledby="waqf-title"><Container><div className="gateway-heading"><span>أثر ممتد</span><h2 id="waqf-title">وقف للقدس<br />يبقى أثره</h2><p>حدّد صاحب الوقف واختر المشروع وشاهد تفاصيل الشهادة قبل المتابعة.</p><Button href="/waqf" variant="outline">مشاريع الوقف</Button></div><WaqfBuilder /></Container></section></PatternBackground>;
}

export function RecurringGiving() {
  return <PatternBackground variant="directional" tone="recurring" position="top" fadeDirection="bottom"><section className="home-section recurring-section" id="recurring" aria-labelledby="recurring-title"><Container><div className="gateway-heading"><span>عطاء منتظم</span><h2 id="recurring-title">يوميًا أو كل جمعة<br />أو شهريًا</h2><p>اختر الإيقاع الذي يناسبك والمشروع الذي ترغب في دعمه باستمرار.</p><Button href="/recurring" variant="outline">أنشئ خطة عطاء</Button></div><RecurringGivingTool /></Container></section></PatternBackground>;
}

export function ImpactReels() {
  return <section className="home-section reels-section" id="impact-stories" aria-labelledby="reels-title"><Container><div className="section-heading-row"><div><span className="section-eyebrow">من الميدان</span><h2 id="reels-title">تحديثات مرتبطة بالمشروعات</h2><p>صور وفيديوهات وتحديثات توضح سياق التنفيذ عند توفرها واعتمادها.</p></div><Button href="/stories" variant="outline">عرض القصص</Button></div><ReelsExperience /></Container></section>;
}

export function ImpactStats() {
  const items = [
    ["التقارير الميدانية", "تحديثات مرتبطة بالمشروع والمنطقة"],
    ["الوثائق", "تظهر عند توفرها واعتمادها"],
    ["رحلة الأثر", "من الاحتياج إلى التنفيذ والمتابعة"],
    ["منهج التوثيق", "لا نعرض رقمًا بلا مصدر واضح"],
  ];
  return <section className="home-section stats-section" aria-labelledby="stats-title"><Container><div className="stats-intro"><span className="section-eyebrow">الثقة قبل الأرقام</span><h2 id="stats-title">اعرف كيف تُعرض حالة المشروع</h2><p>نوضح حالة التقرير والوثيقة والتحديث بدل تقديم مؤشرات غير معتمدة.</p><Button href="/impact" variant="outline">مركز الأثر والتقارير</Button></div><div className="stats-list">{items.map(([title, text], index) => <div key={title}><span>0{index + 1}</span><strong>{title}</strong><p>{text}</p></div>)}</div></Container></section>;
}

export function TrustProof() {
  const docs = ["إيصال التبرع", "إيصال الزكاة", "شهادة الوقف", "التحديث الميداني", "تقرير المشروع"];
  return <section className="home-section trust-section" aria-labelledby="trust-title"><Container><div className="section-heading-row"><div><span className="section-eyebrow">وثائق بحسب نية العطاء</span><h2 id="trust-title">مسار واضح لكل مساهمة</h2><p>تبقى الزكاة والوقف والتبرعات العامة منفصلة داخل السلة والإيصال والمتابعة.</p></div></div><div className="trust-layout"><div className="document-preview"><span>رحلة الوثيقة</span><h3>يظهر كل مستند عند توفره واعتماده</h3><p>لا تعرض المنصة شهادة أو تقريرًا قبل إصداره فعليًا.</p><Button href="/impact" variant="outline">شاهد رحلة الأثر</Button></div><div className="document-list">{docs.map((item, index) => <div key={item}><span>0{index + 1}</span><strong>{item}</strong><small>وفق حالة المشروع والاعتماد</small></div>)}</div></div></Container></section>;
}

export function KnowledgeCenter() {
  const links = ["/knowledge/estimate-your-zakat", "/knowledge/waqf-versus-charity", "/knowledge/continuous-giving-plan", "/knowledge/follow-project-reports", "/knowledge"];
  return <section className="home-section knowledge-section" id="knowledge" aria-labelledby="knowledge-title"><Container><div className="section-heading-row"><div><span className="section-eyebrow">مركز المعرفة</span><h2 id="knowledge-title">اعرف قبل أن تعطي</h2><p>أدلة مختصرة تساعدك على فهم الزكاة والوقف والعطاء المستمر ومسار التقارير.</p></div><Button href="/knowledge" variant="outline">عرض جميع الأدلة</Button></div><div className="knowledge-layout"><article className="knowledge-featured"><span>دليل الزكاة</span><h3>{knowledge[0]}</h3><p>شرح مبسّط للنية والحساب التقديري ومسار التوثيق.</p><a href={links[0]}>اقرأ الدليل</a></article><div className="knowledge-list">{knowledge.slice(1).map((item, index) => <article key={item}><span>0{index + 2}</span><h3>{item}</h3><a href={links[index + 1]}>اقرأ المقال</a></article>)}</div></div></Container></section>;
}

export function SoftGateway() {
  return <section className="home-section soft-gateway" id="about" aria-labelledby="soft-title"><Container><div><span className="section-eyebrow">خطوتك التالية</span><h2 id="soft-title">ابدأ عطائك من نية واضحة</h2><p>اختر المشروع أو المسار المناسب، ثم راجع مساهمتك داخل سلة عطاء واحدة.</p></div><div className="soft-gateway-actions"><Button href="#donate" size="large">تبرع الآن</Button><Button href="/projects" variant="outline" size="large">استكشف المشاريع</Button></div></Container></section>;
}

export { QuickDonation };
