import {
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  HandHeart,
  Landmark,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { PatternBackground } from "@/components/brand/pattern-background";
import { ProjectsCarousel } from "@/components/projects/projects-carousel";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { projects } from "@/data/projects";

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

function ProjectImage({ project }: { project: (typeof projects)[number] }) {
  if (!project.image) return null;
  return (
    <img
      className="home-hero-v4__image"
      src={project.image.sourceUrl}
      alt={project.image.alt.ar}
      width={1400}
      height={1000}
      loading="eager"
      fetchPriority="high"
      decoding="async"
      style={{ objectPosition: project.slug === "gaza-food-parcels" ? "50% 34%" : "50% 42%" }}
    />
  );
}

export function HomepageHero() {
  return (
    <section className="home-hero-v4" id="top" aria-labelledby="home-hero-v4-title">
      <Container className="home-hero-v4__grid">
        <div className="home-hero-v4__copy">
          <span className="home-hero-v4__kicker">لأجل الأقصى وأهل غزة</span>
          <h1 id="home-hero-v4-title">تبرع لمشاريع القدس والأقصى وغزة</h1>
          <p>اختر المشروع والمبلغ، ثم أضف تبرعك إلى السلة.</p>
          <div className="home-hero-v4__actions">
            <Button href="#donate" size="large">تبرع الآن</Button>
            <a href="/projects" className="home-hero-v4__secondary">استكشف المشاريع <ArrowLeft size={17} aria-hidden="true" /></a>
          </div>
          <div className="home-hero-v4__assurance">
            <ShieldCheck size={19} aria-hidden="true" />
            <span>اختر بين التبرع العام والزكاة والوقف والتبرع الدوري.</span>
          </div>
        </div>

        <figure className="home-hero-v4__visual">
          {heroProject ? <ProjectImage project={heroProject} /> : null}
          <figcaption>
            <span>{heroProject ? regionLabels[heroProject.region] : "فلسطين"}</span>
            <strong>{heroProject?.title.ar ?? "مشاريع منبر الأقصى"}</strong>
            <a href={heroProject ? `/projects/${heroProject.slug}` : "/projects"}>عرض المشروع</a>
          </figcaption>
        </figure>
      </Container>
    </section>
  );
}

const givingIntents = [
  { label: "القدس", text: "مشاريع لدعم أهل القدس وخدمة الأقصى.", href: "/projects?region=al-quds", tone: "quds", featured: true },
  { label: "الزكاة", text: "احسب زكاتك واختر مشروعًا يقبل الزكاة.", href: "/zakat", tone: "zakat" },
  { label: "الأوقاف", text: "اختر مشروع وقف وحدد قيمة مساهمتك.", href: "/waqf", tone: "waqf" },
  { label: "العطاء المستمر", text: "تبرع يوميًا أو كل جمعة أو شهريًا.", href: "/recurring", tone: "recurring" },
  { label: "الإغاثة العاجلة", text: "ادعم الاحتياجات الإنسانية العاجلة.", href: "/projects?intent=relief", tone: "relief" },
  { label: "غزة", text: "غذاء ومياه وإغاثة لأهل غزة.", href: "/projects?region=gaza", tone: "gaza" },
] as const;

export function GivingIntentNavigation() {
  return (
    <section className="home-section-v4 intent-editorial" aria-labelledby="intent-editorial-title">
      <Container>
        <header className="home-section-v4__heading">
          <span>مجالات التبرع</span>
          <h2 id="intent-editorial-title">اختر المجال الذي تريد دعمه</h2>
          <p>انتقل مباشرة إلى المشاريع أو نوع التبرع المناسب.</p>
        </header>
        <div className="intent-editorial__grid">
          {givingIntents.map((intent, index) => (
            <a
              className={`intent-editorial__item intent-editorial__item--${intent.tone}${"featured" in intent && intent.featured ? " is-featured" : ""}`}
              href={intent.href}
              key={intent.label}
            >
              <span className="intent-editorial__number">0{index + 1}</span>
              <div><strong>{intent.label}</strong><p>{intent.text}</p></div>
              <ArrowLeft size={20} aria-hidden="true" />
            </a>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function OfficialProjects() {
  return (
    <PatternBackground intensity="soft" position="full" fadeDirection="both" variant="section" tone="home" className="home-projects-v4">
      <section className="home-section-v4 project-carousel-showcase" id="projects" aria-labelledby="projects-title">
        <Container>
          <div className="home-section-v4__heading-row">
            <header className="home-section-v4__heading">
              <span>مشاريع متاحة للتبرع</span>
              <h2 id="projects-title">اختر مشروعًا واطّلع على تفاصيله</h2>
              <p>تعرف على المنطقة والمستفيدين وطريقة المساهمة قبل التبرع.</p>
            </header>
            <Button href="/projects" variant="outline">عرض جميع المشاريع</Button>
          </div>
          <ProjectsCarousel projects={homepageProjects} />
        </Container>
      </section>
    </PatternBackground>
  );
}

const journeySteps = [
  ["اختر نوع التبرع", "تبرع عام أو زكاة أو وقف أو تبرع دوري."],
  ["اختر المشروع والمبلغ", "راجع المنطقة والاحتياج قبل الإضافة."],
  ["راجع السلة", "تأكد من المشاريع والمبالغ قبل المتابعة."],
  ["تابع المشروع", "اقرأ التحديثات والتقارير عند نشرها."],
] as const;

export function DonationJourney() {
  return (
    <section className="home-section-v4 journey-v4" aria-labelledby="journey-v4-title">
      <Container>
        <header className="home-section-v4__heading journey-v4__heading">
          <span>كيف تتبرع؟</span>
          <h2 id="journey-v4-title">أربع خطوات بسيطة</h2>
        </header>
        <ol className="journey-v4__track">
          {journeySteps.map(([title, text], index) => (
            <li key={title}>
              <span>0{index + 1}</span>
              <div><strong>{title}</strong><p>{text}</p></div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export function GivingPathways() {
  return (
    <section className="home-section-v4 pathways-v4" aria-labelledby="pathways-v4-title">
      <Container>
        <header className="home-section-v4__heading">
          <span>أنواع التبرع</span>
          <h2 id="pathways-v4-title">الزكاة والوقف والتبرع الدوري</h2>
          <p>اختر النوع المناسب، ثم حدّد المشروع والمبلغ.</p>
        </header>

        <div className="pathways-v4__grid">
          <article className="pathway-v4 pathway-v4--zakat">
            <div className="pathway-v4__icon"><HandHeart size={24} aria-hidden="true" /></div>
            <span>الزكاة</span>
            <h3>احسب زكاتك واختر مشروعًا</h3>
            <p>استخدم الحاسبة التقديرية، ثم اختر مشروعًا يقبل الزكاة.</p>
            <a href="/zakat">احسب زكاتك <ArrowLeft size={17} aria-hidden="true" /></a>
          </article>

          <article className="pathway-v4 pathway-v4--waqf">
            <div className="pathway-v4__icon"><Landmark size={24} aria-hidden="true" /></div>
            <span>الوقف</span>
            <h3>اختر مشروع الوقف</h3>
            <p>تعرف على المشروع، وحدد صاحب الوقف والمبلغ.</p>
            <a href="/waqf">استكشف الأوقاف <ArrowLeft size={17} aria-hidden="true" /></a>
          </article>

          <article className="pathway-v4 pathway-v4--recurring">
            <div className="pathway-v4__icon"><RefreshCw size={24} aria-hidden="true" /></div>
            <div>
              <span>العطاء المستمر</span>
              <h3>تبرع يوميًا أو أسبوعيًا أو شهريًا</h3>
              <p>اختر التكرار والمبلغ والمشروع الذي تريد دعمه.</p>
            </div>
            <a href="/recurring">أنشئ تبرعًا دوريًا <ArrowLeft size={17} aria-hidden="true" /></a>
          </article>
        </div>
      </Container>
    </section>
  );
}

const trustItems = [
  ["معلومات واضحة", "نعرض تفاصيل المشروع المتاحة دون أرقام غير معتمدة.", ShieldCheck],
  ["تقارير ميدانية", "تظهر التحديثات بعد مراجعتها واعتمادها.", FileCheck2],
  ["إيصالات التبرع", "يظهر نوع التبرع والمشروع في السلة والإيصال.", CheckCircle2],
  ["متابعة المشروع", "يمكنك العودة إلى صفحة المشروع لقراءة آخر التحديثات.", HandHeart],
] as const;

export function ImpactAndTrust() {
  return (
    <section className="home-section-v4 trust-v4" aria-labelledby="trust-v4-title">
      <Container className="trust-v4__layout">
        <header className="trust-v4__intro">
          <span>التقارير والثقة</span>
          <h2 id="trust-v4-title">اعرف أين يذهب تبرعك</h2>
          <p>نوضح المشروع ونوع التبرع، وننشر التقارير والتحديثات عند اعتمادها.</p>
          <a href="/impact">عرض التقارير والتحديثات <ArrowLeft size={18} aria-hidden="true" /></a>
        </header>
        <div className="trust-v4__list">
          {trustItems.map(([title, text, Icon]) => (
            <article key={title}>
              <Icon size={22} aria-hidden="true" />
              <div><h3>{title}</h3><p>{text}</p></div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

const knowledgeLinks = [
  { label: "الوقف", title: "ما الفرق بين الوقف والصدقة الجارية؟", href: "/knowledge/waqf-versus-charity" },
  { label: "الصدقة الجارية", title: "كيف تختار مشروعًا ممتد النفع؟", href: "/knowledge" },
  { label: "التبرع الدوري", title: "كيف تنشئ تبرعًا منتظمًا؟", href: "/knowledge/continuous-giving-plan" },
] as const;

export function KnowledgeCenter() {
  return (
    <section className="home-section-v4 knowledge-v4" id="knowledge" aria-labelledby="knowledge-v4-title">
      <Container>
        <div className="home-section-v4__heading-row">
          <header className="home-section-v4__heading">
            <span>معلومات مهمة</span>
            <h2 id="knowledge-v4-title">اقرأ قبل التبرع</h2>
          </header>
          <Button href="/knowledge" variant="outline">عرض الأدلة</Button>
        </div>

        <div className="knowledge-v4__layout">
          <article className="knowledge-v4__feature">
            <span>دليل الزكاة</span>
            <h3>كيف تحسب زكاتك وتختار المشروع؟</h3>
            <p>تعرف على الحاسبة التقديرية والمشاريع التي تقبل الزكاة.</p>
            <a href="/knowledge/estimate-your-zakat">اقرأ الدليل <ArrowLeft size={18} aria-hidden="true" /></a>
          </article>
          <div className="knowledge-v4__links">
            {knowledgeLinks.map((item, index) => (
              <a href={item.href} key={item.title}>
                <span>0{index + 2}</span>
                <div><small>{item.label}</small><strong>{item.title}</strong></div>
                <ArrowLeft size={18} aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

export function SoftGateway() {
  return (
    <section className="final-giving-cta" id="about" aria-labelledby="final-giving-cta-title">
      <Container className="final-giving-cta__layout">
        <div>
          <span>ابدأ الآن</span>
          <h2 id="final-giving-cta-title">اختر مشروعًا وأضف تبرعك</h2>
          <p>استعرض المشاريع، وحدد المبلغ، ثم راجع السلة.</p>
        </div>
        <div className="final-giving-cta__actions">
          <Button href="/projects" size="large">استكشف المشاريع</Button>
          <a href="/#donate">تبرع الآن</a>
        </div>
      </Container>
    </section>
  );
}
