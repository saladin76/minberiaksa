import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import type { ProjectRecord } from "@/data/projects";

const regionLabels: Record<string, string> = {
  gaza: "غزة",
  "al-quds": "القدس",
  "al-aqsa": "الأقصى",
  syria: "سوريا",
  sudan: "السودان",
  yemen: "اليمن",
  global: "مشاريع عامة",
};

export function ProjectsHero({ projects }: { projects: ProjectRecord[] }) {
  const featured = projects.find((project) => project.featured && project.image)
    ?? projects.find((project) => project.image);

  return (
    <section className="projects-hero" aria-labelledby="projects-page-title">
      <Container className="projects-hero-grid">
        <div className="projects-hero-copy">
          <span className="section-eyebrow">مشاريع منبر الأقصى</span>
          <h1 id="projects-page-title">اختر مشروعًا واضح الهدف، وتابع أثره.</h1>
          <p>استكشف المشاريع حسب المنطقة ونوع العطاء، واطّلع على حالة المشروع ومسار التوثيق قبل إضافة مساهمتك إلى السلة.</p>
          <div className="projects-hero-actions">
            <Button href="#projects-explorer" size="large">استكشف المشاريع</Button>
            <Button href="/#donate" variant="outline" size="large">تبرع حيث الحاجة أشد</Button>
          </div>
          <ul className="projects-trust-line" aria-label="مزايا تجربة المشاريع">
            <li>مشروعات مرتبطة ببياناتها</li>
            <li>نية العطاء واضحة</li>
            <li>التوثيق يظهر بحالته الفعلية</li>
          </ul>
        </div>

        <div className="projects-hero-visual">
          {featured?.image ? (
            <img src={featured.image.sourceUrl} alt={featured.image.alt.ar} />
          ) : (
            <div className="projects-image-fallback" role="img" aria-label="صورة ميدانية للمشاريع قيد الإضافة">
              <span>مشاريع القدس والأقصى وغزة</span>
            </div>
          )}
          <a className="projects-featured-link" href={featured ? `/projects/${featured.slug}` : "/projects"}>
            <span>مشروع من الميدان</span>
            <strong>{featured?.title.ar ?? "استكشف مشروعات المؤسسة"}</strong>
            <small>{featured ? regionLabels[featured.region] : "فلسطين"} · عرض المشروع</small>
          </a>
        </div>
      </Container>
    </section>
  );
}
