import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import type { ProjectRecord } from "@/data/projects";

export function ProjectsHero({ projects }: { projects: ProjectRecord[] }) {
  const regionCount = new Set(projects.map((project) => project.region)).size;
  const donationTypeCount = new Set(projects.flatMap((project) => project.donationTypes)).size;
  return <section className="projects-hero" aria-labelledby="projects-page-title"><Container className="projects-hero-grid"><div><span className="section-eyebrow">مشاريع منبر الأقصى الرسمية</span><h1 id="projects-page-title">مشاريع رسمية تصنع أثرًا<br />في القدس والأقصى وغزة</h1><p>استكشف مشاريع مؤسسة منبر الأقصى الرسمية، واختر المنطقة ونوع العطاء والمجال الذي ترغب في دعمه.</p><div className="projects-hero-actions"><Button href="#projects-explorer" size="large">استكشف المشاريع</Button><Button href="/#donate" variant="outline" size="large">حيث الحاجة أشد</Button></div><div className="projects-trust-line">مشاريع رسمية · تحديثات ميدانية · تقارير وإيصالات</div></div><div className="projects-hero-visual"><div className="projects-image-placeholder" role="img" aria-label="مساحة صورة مشاريع رسمية معتمدة"><strong>APPROVED PROJECTS IMAGE REQUIRED</strong><span>Official Minber field project · Verified source · No AI</span></div><dl><div><dt>المشاريع المتاحة</dt><dd>{projects.length}</dd></div><div><dt>المناطق</dt><dd>{regionCount}</dd></div><div><dt>أنواع العطاء</dt><dd>{donationTypeCount}</dd></div></dl></div></Container></section>;
}
