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
          <h1 id="projects-page-title">اختر المشروع الذي تريد دعمه</h1>
          <p>تعرّف على المشروع والمنطقة والمستفيدين، ثم اختر المبلغ وأضفه إلى السلة.</p>
          <div className="projects-hero-actions">
            <Button href="#projects-explorer" size="large">استكشف المشاريع</Button>
            <Button href="/#donate" variant="outline" size="large">تبرع حيث الحاجة أشد</Button>
          </div>
          <ul className="projects-trust-line" aria-label="معلومات المشاريع">
            <li>تفاصيل واضحة لكل مشروع</li>
            <li>نوع التبرع محدد</li>
            <li>التقارير تظهر عند اعتمادها</li>
          </ul>
        </div>

        <div className="projects-hero-visual">
          {featured?.image ? (
            <img src={featured.image.sourceUrl} alt={featured.image.alt.ar} />
          ) : null}
          <a className="projects-featured-link" href={featured ? `/projects/${featured.slug}` : "/projects"}>
            <span>من مشاريعنا</span>
            <strong>{featured?.title.ar ?? "استكشف مشاريع المؤسسة"}</strong>
            <small>{featured ? regionLabels[featured.region] : "فلسطين"} · عرض المشروع</small>
          </a>
        </div>
      </Container>
    </section>
  );
}
