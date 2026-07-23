import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import { StickyDonateBar } from "@/components/layout/sticky-donate-bar";
import { Button } from "@/components/ui/button";
import { projects } from "@/data/projects";

export const metadata: Metadata = {
  title: "الأثر والتقارير | مؤسسة منبر الأقصى الدولية",
  description: "تابع تقارير المشاريع والتحديثات الميدانية التي تعتمدها المؤسسة.",
};

const activeProjects = projects.filter((project) => project.status === "active").slice(0, 6);

export default function ImpactPage() {
  return (
    <>
      <TopUtilityBar />
      <SiteHeader />
      <main id="main-content">
        <nav className="site-container breadcrumb" aria-label="مسار الصفحة">
          <a href="/">الرئيسية</a><span aria-hidden="true">/</span><span aria-current="page">الأثر والتقارير</span>
        </nav>

        <section className="impact-hero">
          <div className="site-container">
            <span>التقارير والتحديثات</span>
            <h1>تابع ما نُشر عن المشاريع</h1>
            <p>نعرض هنا التقارير والصور والتحديثات بعد مراجعتها واعتمادها من المؤسسة.</p>
            <div>
              <Button href="/projects" size="large">استكشف المشاريع</Button>
              <Button href="/stories" variant="outline" size="large">القصص الميدانية</Button>
            </div>
          </div>
        </section>

        <section className="impact-section">
          <div className="site-container">
            <header className="section-intro">
              <span>كيف نوثق المشاريع؟</span>
              <h2>مراجعة المعلومات قبل نشرها</h2>
              <p>نتحقق من مصدر التحديث والصور والبيانات قبل ظهورها على الموقع.</p>
            </header>
            <ol className="impact-method-list">
              <li><span>01</span><h3>استلام التحديث</h3><p>يصل التحديث مرتبطًا بمشروع ومصدر محددين.</p></li>
              <li><span>02</span><h3>مراجعة المعلومات</h3><p>نراجع الأرقام والتواريخ والصور والوثائق.</p></li>
              <li><span>03</span><h3>اعتماد المحتوى</h3><p>لا ننشر أي مادة قبل التأكد منها.</p></li>
              <li><span>04</span><h3>نشر التحديث</h3><p>يظهر التحديث في صفحة المشروع وهذه الصفحة.</p></li>
            </ol>
          </div>
        </section>

        <section className="impact-section progress-projects">
          <div className="site-container">
            <header className="section-intro">
              <span>المشاريع الحالية</span>
              <h2>تابع كل مشروع من صفحته</h2>
              <p>تظهر التحديثات والتقارير داخل صفحة المشروع بعد اعتمادها.</p>
            </header>
            <div className="related-projects-grid">
              {activeProjects.map((project) => (
                <article key={project.id}>
                  <a className="related-project-media" href={`/projects/${project.slug}`}>
                    {project.image ? <img src={project.image.sourceUrl} alt={project.image.alt.ar} loading="lazy" /> : null}
                  </a>
                  <div>
                    <h3><a href={`/projects/${project.slug}`}>{project.title.ar}</a></h3>
                    <p>{project.summary.ar}</p>
                    <Button href={`/projects/${project.slug}`} variant="outline" size="small">عرض المشروع</Button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="impact-section">
          <div className="site-container">
            <header className="section-intro">
              <span>التقارير والوثائق</span>
              <h2>لا توجد تقارير عامة منشورة حاليًا</h2>
              <p>ستظهر الملفات الرسمية هنا بعد اعتمادها، مع اسم المشروع وتاريخ النشر.</p>
            </header>
            <div className="account-empty-state">
              <h3>لا توجد ملفات متاحة الآن</h3>
              <p>يمكنك متابعة صفحات المشاريع لمعرفة آخر التحديثات المنشورة.</p>
              <Button href="/projects" variant="outline">عرض المشاريع</Button>
            </div>
          </div>
        </section>

        <section className="impact-final">
          <div className="site-container">
            <div><span>ادعم مشروعًا</span><h2>اختر المشروع الذي تريد دعمه</h2></div>
            <Button href="/projects">استكشف المشاريع</Button>
          </div>
        </section>
      </main>
      <SiteFooter />
      <StickyDonateBar />
    </>
  );
}
