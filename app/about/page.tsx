import type { Metadata } from "next";
import { PatternBackground } from "@/components/brand/pattern-background";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { StickyDonateBar } from "@/components/layout/sticky-donate-bar";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: `من نحن | ${siteConfig.nameAr}`,
  description:
    "تعرّف إلى رسالة مؤسسة منبر الأقصى الدولية، مجالات عملها، ومنهجها في ربط المساهمة بالاحتياج والتحديثات المتاحة.",
};

const HERO_IMAGE = "https://drive.google.com/uc?export=view&id=1vslhxCj1c7KpF0dziaG5ZRJBO8OQFmDu";
const HUMAN_IMAGE = "https://drive.google.com/uc?export=view&id=14ExUX9TVvMB-jc_mWa_iPnqSjl_UH0lv";

const workAreas = [
  {
    title: "القدس والأقصى",
    description: "مشاريع ترتبط باحتياجات القدس والأقصى ودعم الإنسان في محيطهما.",
    href: "/projects",
    tone: "primary",
  },
  {
    title: "الإغاثة في غزة",
    description: "مسارات إغاثية تستجيب للاحتياجات الإنسانية ذات الأولوية.",
    href: "/projects",
    tone: "relief",
  },
  {
    title: "الزكاة",
    description: "مسار واضح لتوجيه الزكاة إلى المشاريع والاحتياجات المرتبطة بنيتها.",
    href: "/zakat",
    tone: "zakat",
  },
  {
    title: "الأوقاف",
    description: "خيارات عطاء وقفي تركز على استمرارية النفع وفق المشروع المتاح.",
    href: "/waqf",
    tone: "waqf",
  },
  {
    title: "العطاء المستمر",
    description: "مساهمات يومية أو أسبوعية أو شهرية ترتبط بمسار يختاره المتبرع.",
    href: "/recurring",
    tone: "recurring",
  },
  {
    title: "المشاريع الإنسانية",
    description: "مشاريع متنوعة تُعرض طبيعتها واحتياجها قبل اختيار المساهمة.",
    href: "/projects",
    tone: "humanitarian",
  },
] as const;

const processSteps = [
  ["تحديد الاحتياج", "فهم الحاجة ذات الأولوية والمسار الأنسب لها."],
  ["اختيار المشروع أو المسار", "عرض الخيارات ليختار المتبرع ما يوافق نية عطائه."],
  ["استقبال المساهمة", "تسجيل المساهمة ضمن المشروع أو النية المحددة."],
  ["متابعة التنفيذ", "متابعة مراحل العمل بحسب طبيعة المشروع وإمكاناته."],
  ["نشر المتاح", "عرض التحديثات أو الوثائق الميدانية عندما تصبح متاحة."],
  ["ربط المتبرع بالأثر", "إبقاء رحلة العطاء مفهومة من الاختيار إلى ما يظهر من أثر."],
] as const;

const trustPrinciples = [
  "عرض طبيعة المشروع قبل المساهمة.",
  "توضيح النية أو المسار.",
  "تقديم الإيصال أو سجل المساهمة عند توفره.",
  "نشر التحديثات الميدانية والوثائق المتاحة.",
  "عدم عرض أرقام غير معتمدة.",
  "فصل التبرعات حسب النية والمشروع.",
] as const;

export default function AboutPage() {
  return (
    <>
      <TopUtilityBar />
      <SiteHeader />
      <main id="main-content" className="about-page">
        <PatternBackground
          intensity="medium"
          position="full"
          fadeDirection="both"
          variant="directional"
          tone="home"
          className="about-hero-pattern"
        >
          <section className="about-hero" aria-labelledby="about-hero-title">
            <Container className="about-hero__grid">
              <div className="about-hero__copy">
                <p className="about-kicker">من نحن</p>
                <h1 id="about-hero-title">منبر للأقصى… وعطاء يصل إلى الإنسان</h1>
                <p className="about-hero__description">
                  مؤسسة إنسانية تعمل على توجيه العطاء إلى المشاريع والاحتياجات ذات الأولوية، مع تقديم مسار أكثر وضوحًا من المساهمة إلى التحديثات الميدانية.
                </p>
                <div className="about-hero__actions" aria-label="روابط الصفحة الرئيسية">
                  <a className="about-button about-button--primary" href="/projects">استكشف المشاريع</a>
                  <a className="about-text-link" href="#about-contact">تواصل معنا</a>
                </div>
              </div>
              <figure className="about-hero__media">
                <img src={HERO_IMAGE} alt="توثيق ميداني مرتبط بأحد مشاريع المؤسسة في القدس" />
                <figcaption>القدس في قلب الرسالة، والإنسان في قلب العطاء.</figcaption>
              </figure>
            </Container>
          </section>
        </PatternBackground>

        <section className="about-editorial about-section" id="about-intro" aria-labelledby="about-intro-title">
          <Container className="about-editorial__grid">
            <div className="about-section-heading">
              <p className="about-kicker">المؤسسة</p>
              <h2 id="about-intro-title">من نحن</h2>
            </div>
            <div className="about-editorial__content">
              <p>
                مؤسسة منبر الأقصى الدولية تعمل على وصل رغبة المتبرع بالمشاريع والاحتياجات المرتبطة بالقدس والأقصى وغزة والفئات الأكثر احتياجًا. ويقوم دورها على تنظيم مسارات العطاء وعرض طبيعة كل مشروع بصورة واضحة تساعد المتبرع على فهم اختياره.
              </p>
              <p>
                لا تنظر المؤسسة إلى المساهمة باعتبارها إجراءً منفصلًا، بل رحلة تبدأ من النية والاختيار، وتمتد إلى متابعة التنفيذ وما يتاح من تحديثات ووثائق ميدانية.
              </p>
              <blockquote>العطاء الأوضح هو العطاء الذي يعرف صاحبه وجهته ويفهم احتياجه.</blockquote>
            </div>
          </Container>
        </section>

        <PatternBackground intensity="soft" position="full" fadeDirection="both" variant="section" tone="waqf" className="about-mv-pattern">
          <section className="about-mv about-section" id="mission-vision" aria-label="الرسالة والرؤية">
            <Container className="about-mv__layout">
              <article className="about-mv__mission">
                <p className="about-kicker">الرسالة</p>
                <h2>توجيه العطاء إلى مشاريع تخدم القدس والأقصى وغزة والفئات الأكثر احتياجًا، مع تعزيز الوضوح والثقة في رحلة المساهمة.</h2>
              </article>
              <article className="about-mv__vision">
                <p className="about-kicker">الرؤية</p>
                <h2>أن تكون منصة عطاء موثوقة تربط المتبرع باحتياجات الميدان، وتساعده على فهم أين يذهب عطاؤه وكيف يظهر أثره.</h2>
              </article>
            </Container>
          </section>
        </PatternBackground>

        <section className="about-areas about-section" id="work-areas" aria-labelledby="work-areas-title">
          <Container>
            <div className="about-section-heading about-section-heading--split">
              <div>
                <p className="about-kicker">مجالات العمل</p>
                <h2 id="work-areas-title">مسارات متعددة… وغاية إنسانية واحدة</h2>
              </div>
              <p>يُعرض كل مجال بحجمه وطبيعته، مع رابط مباشر إلى الصفحة أو المسار المرتبط به.</p>
            </div>
            <div className="about-areas__layout">
              {workAreas.map((area, index) => (
                <article className={`about-area about-area--${area.tone}${index === 0 ? " about-area--featured" : ""}`} key={area.title}>
                  <span className="about-area__index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{area.title}</h3>
                    <p>{area.description}</p>
                  </div>
                  <a href={area.href}>اعرف أكثر <span aria-hidden="true">←</span></a>
                </article>
              ))}
            </div>
          </Container>
        </section>

        <section className="about-process about-section" id="how-we-work" aria-labelledby="how-we-work-title">
          <Container>
            <div className="about-section-heading about-section-heading--center">
              <p className="about-kicker">كيف نعمل</p>
              <h2 id="how-we-work-title">رحلة مترابطة من الاحتياج إلى الأثر</h2>
              <p>مسار واحد متصل يساعد على إبقاء كل مرحلة مفهومة دون مبالغة أو ادعاءات غير مدعومة.</p>
            </div>
            <ol className="about-process__track">
              {processSteps.map(([title, description], index) => (
                <li className="about-process__step" key={title}>
                  <span className="about-process__dot">{index + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        <section className="about-trust" id="trust" aria-labelledby="trust-title">
          <Container className="about-trust__grid">
            <div className="about-trust__intro">
              <p className="about-kicker">الثقة والشفافية</p>
              <h2 id="trust-title">الوضوح جزء من رحلة العطاء</h2>
              <p>تُبنى الثقة من خلال منهج واضح في عرض المشروع، وتحديد المسار، ومشاركة ما يصبح متاحًا من تحديثات ووثائق.</p>
            </div>
            <ul className="about-trust__principles">
              {trustPrinciples.map((principle, index) => (
                <li key={principle}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <p>{principle}</p>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section className="about-human about-section" aria-labelledby="about-human-title">
          <Container className="about-human__grid">
            <figure className="about-human__media">
              <img src={HUMAN_IMAGE} alt="تسليم مساعدة ميدانية لعائلة في غزة" />
            </figure>
            <div className="about-human__copy">
              <p className="about-kicker">المؤسسة والإنسان</p>
              <h2 id="about-human-title">خلف كل مساهمة… إنسان وقصة واحتياج</h2>
              <p>لا تتعامل المؤسسة مع العطاء كرقم فقط. فكل مشروع يبدأ من احتياج إنساني، وكل مساهمة تحمل نية، وكل تحديث ميداني يعيد ربط المتبرع بالغاية التي اختارها.</p>
              <blockquote>نحافظ على كرامة الإنسان، ونكتفي بعرض ما هو معتمد ومناسب للنشر.</blockquote>
            </div>
          </Container>
        </section>

        <section className="about-join about-section" aria-labelledby="about-join-title">
          <Container>
            <div className="about-section-heading">
              <p className="about-kicker">شارك معنا</p>
              <h2 id="about-join-title">اختر المسار الأقرب إلى دورك</h2>
            </div>
            <div className="about-join__layout">
              <article className="about-join__primary">
                <div>
                  <span>المسار الأول</span>
                  <h3>استكشف المشاريع</h3>
                  <p>ابدأ من مشروع تعرف طبيعته وتفهم الاحتياج الذي يعمل من أجله.</p>
                </div>
                <a className="about-button about-button--primary" href="/projects">عرض المشاريع</a>
              </article>
              <div className="about-join__secondary">
                <a href="mailto:info@minberiaksa.org?subject=طلب شراكة مع مؤسسة منبر الأقصى">
                  <span>كن شريكًا</span><small>للتعاون المؤسسي والمبادرات المشتركة</small>
                </a>
                <a href="mailto:info@minberiaksa.org?subject=طلب تطوع مع مؤسسة منبر الأقصى">
                  <span>تطوع معنا</span><small>للمشاركة بالخبرة أو الوقت عند توفر الفرص</small>
                </a>
              </div>
            </div>
          </Container>
        </section>

        <section className="about-contact about-section" id="about-contact" aria-labelledby="about-contact-title">
          <Container className="about-contact__card">
            <div className="about-contact__heading">
              <p className="about-kicker">بيانات المؤسسة</p>
              <h2 id="about-contact-title">{siteConfig.nameAr}</h2>
              <p>للتواصل أو المشاركة أو الاستفسار عن أحد المسارات، استخدم البيانات الرسمية التالية.</p>
              <a className="about-text-link about-text-link--light" href="mailto:info@minberiaksa.org">تواصل معنا</a>
            </div>
            <dl className="about-contact__details">
              <div>
                <dt>البريد الإلكتروني</dt>
                <dd><a dir="ltr" href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a></dd>
              </div>
              <div>
                <dt>أرقام التواصل</dt>
                <dd className="about-contact__phones">
                  {siteConfig.phones.map((phone) => <a dir="ltr" href={`tel:${phone.replace(/\s/g, "")}`} key={phone}>{phone}</a>)}
                </dd>
              </div>
              <div>
                <dt>العنوان</dt>
                <dd dir="ltr" className="about-contact__address">{siteConfig.address}</dd>
              </div>
            </dl>
          </Container>
        </section>

        <PatternBackground intensity="medium" position="full" fadeDirection="both" variant="dark" className="about-final-pattern">
          <section className="about-final" aria-labelledby="about-final-title">
            <Container className="about-final__box">
              <div>
                <p className="about-kicker">ابدأ من الوضوح</p>
                <h2 id="about-final-title">ابدأ عطاءك من مشروع تعرفه وتفهم احتياجه</h2>
                <p>استعرض المشاريع المتاحة واختر المسار الأقرب إلى نية عطائك.</p>
              </div>
              <div className="about-final__actions">
                <a className="about-button about-button--red" href="/projects">استكشف المشاريع</a>
                <a className="about-text-link about-text-link--light" href="#about-contact">تواصل معنا</a>
              </div>
            </Container>
          </section>
        </PatternBackground>
      </main>
      <SiteFooter />
      <StickyDonateBar />
    </>
  );
}
