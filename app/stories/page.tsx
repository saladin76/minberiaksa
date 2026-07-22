import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import { StickyDonateBar } from "@/components/layout/sticky-donate-bar";
import { Button } from "@/components/ui/button";
import { projects } from "@/data/projects";

export const metadata: Metadata = {
  title: "القصص الميدانية | مؤسسة منبر الأقصى الدولية",
  description: "مساحة القصص والصور والفيديوهات الميدانية المرتبطة بمشاريع المؤسسة بعد اعتمادها.",
};

const storyReadyProjects = projects.filter((project) => project.image).slice(0, 6);

export default function StoriesPage() {
  return (
    <>
      <TopUtilityBar />
      <SiteHeader />
      <main id="main-content">
        <nav className="site-container breadcrumb" aria-label="مسار الصفحة">
          <a href="/">الرئيسية</a><span aria-hidden="true">/</span><span aria-current="page">القصص الميدانية</span>
        </nav>

        <section className="stories-hero">
          <div className="site-container">
            <span>من المشروع إلى الحكاية الموثقة</span>
            <h1>قصص من الميدان<br />تنشر بعد اعتمادها</h1>
            <p>نعرض الصور والفيديوهات والقصص عندما تكون مرتبطة بمشروع واضح ومصدر معروف وموافقة مناسبة للنشر.</p>
            <div>
              <Button href="/projects" size="large">استكشف المشاريع</Button>
              <Button href="/impact" variant="outline" size="large">الأثر والتقارير</Button>
            </div>
          </div>
        </section>

        <section className="stories-section">
          <div className="site-container">
            <header className="section-intro">
              <span>مكتبة القصص</span>
              <h2>لا توجد قصص ميدانية معتمدة للنشر بعد</h2>
              <p>لن نعرض فيديوهات وهمية أو صورًا مكررة أو قصص مستفيدين دون مصدر وموافقة وتوثيق واضح.</p>
            </header>
            <div className="account-empty-state">
              <h3>المكتبة قيد الإعداد</h3>
              <p>ستظهر هنا الأفلام القصيرة والقصص المصورة والتحديثات الرأسية بعد اعتماد ملفاتها وربطها بالمشروع والتقرير المناسب.</p>
            </div>
          </div>
        </section>

        <section className="stories-section stories-standards">
          <div className="site-container">
            <header className="section-intro">
              <span>معايير النشر</span>
              <h2>كل قصة تمر بأربع مراجعات</h2>
            </header>
            <ol>
              <li><span>01</span><h3>المصدر</h3><p>ملف أصلي أو رابط رسمي مرتبط بالفريق أو المشروع.</p></li>
              <li><span>02</span><h3>الكرامة والخصوصية</h3><p>لا تُستخدم صور صادمة أو معلومات شخصية غير لازمة.</p></li>
              <li><span>03</span><h3>السياق</h3><p>توضح القصة المشروع والمرحلة دون مبالغة أو نتيجة غير موثقة.</p></li>
              <li><span>04</span><h3>الاعتماد</h3><p>تُنشر المادة بعد مراجعة النص والصورة والتاريخ والجهة.</p></li>
            </ol>
          </div>
        </section>

        <section className="stories-section">
          <div className="site-container">
            <header className="section-intro">
              <span>مشاريع تنتظر تحديثاتها</span>
              <h2>تعرّف على المشاريع من صفحاتها الحالية</h2>
              <p>صفحة المشروع هي المرجع الأساسي حتى نشر قصة ميدانية مستقلة.</p>
            </header>
            <div className="related-projects-grid">
              {storyReadyProjects.map((project) => (
                <article key={project.id}>
                  <a className="related-project-media" href={`/projects/${project.slug}`}>
                    <img src={project.image!.sourceUrl} alt={project.image!.alt.ar} loading="lazy" />
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

        <section className="stories-final">
          <div className="site-container">
            <div><span>القصة تبدأ من مشروع واضح</span><h2>ساهم في مشروع وتابع تحديثاته عند اعتمادها</h2></div>
            <Button href="/projects">دعم مشروع</Button>
          </div>
        </section>
      </main>
      <SiteFooter />
      <StickyDonateBar />
    </>
  );
}