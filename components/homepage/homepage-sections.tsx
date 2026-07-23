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
          <span className="home-hero-v4__kicker">منصة عطاء مقدسية عالمية</span>
          <h1 id="home-hero-v4-title">اجعل أثر عطائك واضحًا في القدس والأقصى وغزة</h1>
          <p>اختر نية عطائك، ثم تابع مساهمتك من الإيصال إلى تحديثات الأثر.</p>
          <div className="home-hero-v4__actions">
            <Button href="#donate" size="large">تبرع الآن</Button>
            <a href="/projects" className="home-hero-v4__secondary">استكشف المشاريع <ArrowLeft size={17} aria-hidden="true" /></a>
          </div>
          <div className="home-hero-v4__assurance">
            <ShieldCheck size={19} aria-hidden="true" />
            <span>مسارات منفصلة للزكاة والوقف والعطاء المستمر، مع مراجعة واضحة قبل المتابعة.</span>
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
  { label: "القدس", text: "مشاريع تحفظ صمود العائلات وتدعم التعليم والترميم.", href: "/projects?region=al-quds", tone: "quds", featured: true },
  { label: "الزكاة", text: "مسار مستقل يوجّه الزكاة إلى المشاريع المؤهلة.", href: "/zakat", tone: "zakat" },
  { label: "الأوقاف", text: "عطاء طويل الأثر مرتبط بمشاريع القدس والأقصى.", href: "/waqf", tone: "waqf" },
  { label: "العطاء المستمر", text: "مساهمة يومية أو أسبوعية أو شهرية قابلة للإدارة.", href: "/recurring", tone: "recurring" },
  { label: "الإغاثة العاجلة", text: "استجابة للاحتياجات الإنسانية الأكثر إلحاحًا.", href: "/projects?intent=relief", tone: "relief" },
  { label: "غزة", text: "غذاء ومياه وإيواء ومشاريع دعم الأسر المتضررة.", href: "/projects?region=gaza", tone: "gaza" },
] as const;

export function GivingIntentNavigation() {
  return (
    <section className="home-section-v4 intent-editorial" aria-labelledby="intent-editorial-title">
      <Container>
        <header className="home-section-v4__heading">
          <span>ابدأ من نيتك</span>
          <h2 id="intent-editorial-title">ستة مسارات، وتجربة عطاء واحدة واضحة</h2>
          <p>اختر الوجهة الأقرب إلى نيتك، ثم انتقل مباشرة إلى المشاريع أو الأداة المناسبة.</p>
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
              <span>مشاريع ميدانية متاحة للعطاء</span>
              <h2 id="projects-title">اختر المشروع الأقرب إلى نية عطائك</h2>
              <p>استعرض المشاريع المتاحة وتعرّف على الاحتياج ومسار التنفيذ قبل إتمام مساهمتك.</p>
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
  ["اختر نية عطائك", "حدد الزكاة أو الوقف أو الإغاثة أو العطاء المستمر."],
  ["اختر المشروع أو التخصيص", "راجع المنطقة والاحتياج ومسار التنفيذ."],
  ["أتمم مساهمتك", "راجع عناصر السلة وبياناتك قبل المتابعة."],
  ["تابع الإيصال وتحديثات الأثر", "ارجع إلى حسابك والوثائق المتاحة للمشروع."],
] as const;

export function DonationJourney() {
  return (
    <section className="home-section-v4 journey-v4" aria-labelledby="journey-v4-title">
      <Container>
        <header className="home-section-v4__heading journey-v4__heading">
          <span>رحلة تبرع مختصرة</span>
          <h2 id="journey-v4-title">من النية إلى متابعة الأثر</h2>
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
          <span>مسارات متخصصة</span>
          <h2 id="pathways-v4-title">لكل نية تجربة تناسبها</h2>
          <p>مساحات مختصرة تقودك إلى الأدوات والصفحات المتخصصة دون تكرار أو ازدحام.</p>
        </header>

        <div className="pathways-v4__grid">
          <article className="pathway-v4 pathway-v4--zakat">
            <div className="pathway-v4__icon"><HandHeart size={24} aria-hidden="true" /></div>
            <span>الزكاة</span>
            <h3>احسب تقديريًا، ثم اختر مشروعًا مؤهلًا</h3>
            <p>مسار واضح يحافظ على نية الزكاة مستقلة ويقودك إلى الحاسبة والمشاريع المرتبطة بها.</p>
            <a href="/zakat">ابدأ مسار الزكاة <ArrowLeft size={17} aria-hidden="true" /></a>
          </article>

          <article className="pathway-v4 pathway-v4--waqf">
            <div className="pathway-v4__icon"><Landmark size={24} aria-hidden="true" /></div>
            <span>الوقف</span>
            <h3>أثر طويل الأجل للقدس والأقصى</h3>
            <p>اختر المشروع وصاحب الوقف وتعرّف على مسار الشهادة قبل إتمام المساهمة.</p>
            <a href="/waqf">استكشف مشاريع الوقف <ArrowLeft size={17} aria-hidden="true" /></a>
          </article>

          <article className="pathway-v4 pathway-v4--recurring">
            <div className="pathway-v4__icon"><RefreshCw size={24} aria-hidden="true" /></div>
            <div>
              <span>العطاء المستمر</span>
              <h3>يوميًا أو كل جمعة أو شهريًا</h3>
              <p>أنشئ إيقاعًا ثابتًا يناسبك، مع سجل مستقل لكل مساهمة وخطة قابلة للإدارة.</p>
            </div>
            <a href="/recurring">أنشئ خطة عطاء <ArrowLeft size={17} aria-hidden="true" /></a>
          </article>
        </div>
      </Container>
    </section>
  );
}

const trustItems = [
  ["منهج التوثيق", "لا تُعرض الأرقام أو الوثائق إلا وفق حالتها الفعلية.", ShieldCheck],
  ["التقارير الميدانية", "تحديثات مرتبطة بالمشروع والمنطقة عند توفرها.", FileCheck2],
  ["الإيصالات والوثائق", "مسار مستقل لكل نية عطاء ووثيقة متاحة.", CheckCircle2],
  ["رحلة الأثر", "متابعة من الاحتياج إلى التنفيذ والتحديث.", HandHeart],
] as const;

export function ImpactAndTrust() {
  return (
    <section className="home-section-v4 trust-v4" aria-labelledby="trust-v4-title">
      <Container className="trust-v4__layout">
        <header className="trust-v4__intro">
          <span>الأثر والثقة</span>
          <h2 id="trust-v4-title">وضوح مؤسسي قبل أي رقم</h2>
          <p>نعرض حالة المشروع والتقرير والوثيقة بوضوح، ونربط التحديثات بمسار العطاء دون ادعاءات غير معتمدة.</p>
          <a href="/impact">استكشف مركز الأثر <ArrowLeft size={18} aria-hidden="true" /></a>
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
  { label: "الصدقة الجارية", title: "كيف تختار مسارًا ممتد الأثر؟", href: "/knowledge" },
  { label: "العطاء المستمر", title: "كيف تنشئ خطة عطاء منتظمة؟", href: "/knowledge/continuous-giving-plan" },
] as const;

export function KnowledgeCenter() {
  return (
    <section className="home-section-v4 knowledge-v4" id="knowledge" aria-labelledby="knowledge-v4-title">
      <Container>
        <div className="home-section-v4__heading-row">
          <header className="home-section-v4__heading">
            <span>المعرفة قبل العطاء</span>
            <h2 id="knowledge-v4-title">محتوى يساعدك على اتخاذ قرار أوضح</h2>
          </header>
          <Button href="/knowledge" variant="outline">مركز المعرفة</Button>
        </div>

        <div className="knowledge-v4__layout">
          <article className="knowledge-v4__feature">
            <span>دليل الزكاة</span>
            <h3>كيف تخرج زكاتك لفلسطين بوضوح؟</h3>
            <p>تعرف على الحساب التقديري، وحفظ النية، وكيفية الانتقال إلى المشاريع المؤهلة دون خلطها بالتبرعات العامة.</p>
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
          <span>خطوتك التالية</span>
          <h2 id="final-giving-cta-title">اختر مشروعك، وابدأ أثرًا واضحًا</h2>
          <p>استكشف المشاريع المتاحة، ثم راجع نيتك ومساهمتك داخل سلة العطاء.</p>
        </div>
        <div className="final-giving-cta__actions">
          <Button href="/projects" size="large">استكشف المشاريع</Button>
          <a href="/#donate">انتقل إلى العطاء السريع</a>
        </div>
      </Container>
    </section>
  );
}
