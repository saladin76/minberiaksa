import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import { StickyDonateBar } from "@/components/layout/sticky-donate-bar";
import { Button } from "@/components/ui/button";
import { projects } from "@/data/projects";

export const metadata: Metadata = {
  title: "الأثر والتقارير | مؤسسة منبر الأقصى الدولية",
  description: "تعرف على منهجية المؤسسة في توثيق المشاريع والتحديثات والتقارير الميدانية.",
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
            <span>الأثر يبدأ بالوضوح</span>
            <h1>نوثّق ما تم تنفيذه<br />وننشر ما تم اعتماده</h1>
            <p>هذه المساحة مخصصة لتحديثات المشاريع والتقارير والوثائق الميدانية. لا نعرض أرقامًا أو إنجازات أو قصصًا قبل مراجعتها واعتمادها.</p>
            <div>
              <Button href="/projects" size="large">استكشف المشاريع</Button>
              <Button href="/stories" variant="outline" size="large">القصص الميدانية</Button>
            </div>
          </div>
        </section>

        <section className="impact-section">
          <div className="site-container">
            <header className="section-intro">
              <span>منهجية النشر</span>
              <h2>كيف تصل المعلومة إلى صفحة الأثر؟</h2>
              <p>تمر كل مادة ميدانية بمراحل واضحة قبل ظهورها للمتبرع أو الزائر.</p>
            </header>
            <ol className="impact-method-list">
              <li><span>01</span><h3>استلام التحديث</h3><p>يرتبط التحديث بمشروع ومصدر ميداني محددين.</p></li>
              <li><span>02</span><h3>مراجعة المحتوى</h3><p>تُراجع الأرقام والتواريخ والصور والوثائق قبل النشر.</p></li>
              <li><span>03</span><h3>اعتماد الحالة</h3><p>لا تُصنف المرحلة كمكتملة قبل وجود دليل مناسب.</p></li>
              <li><span>04</span><h3>النشر والربط</h3><p>يظهر التحديث داخل المشروع ومركز الأثر وحساب المتبرع عند توفره.</p></li>
            </ol>
          </div>
        </section>

        <section className="impact-section progress-projects">
          <div className="site-container">
            <header className="section-intro">
              <span>مشاريع نشطة</span>
              <h2>تابع المشاريع من صفحاتها الرسمية</h2>
              <p>تظهر التحديثات داخل صفحة المشروع فور اعتمادها، دون استخدام بيانات أو وثائق تجريبية.</p>
            </header>
            <div className="related-projects-grid">
              {activeProjects.map((project) => (
                <article key={project.id}>
                  <a className="related-project-media" href={`/projects/${project.slug}`}>
                    {project.image ? <img src={project.image.sourceUrl} alt={project.image.alt.ar} loading="lazy" /> : <span>{project.title.ar}</span>}
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
              <h2>لا توجد تقارير عامة معتمدة للنشر بعد</h2>
              <p>ستظهر هنا الملفات الرسمية فقط بعد اعتمادها، مع اسم المشروع وفترة التقرير وتاريخ النشر.</p>
            </header>
            <div className="account-empty-state">
              <h3>مركز التقارير قيد الإعداد</h3>
              <p>لن نعرض ملفات نموذجية أو أرقام مراجع أو شهادات غير صادرة فعليًا.</p>
              <Button href="/knowledge" variant="outline">زيارة مركز المعرفة</Button>
            </div>
          </div>
        </section>

        <section className="impact-final">
          <div className="site-container">
            <div><span>ساهم في أثر قابل للمتابعة</span><h2>اختر مشروعًا واضح الهدف ومسار التنفيذ</h2></div>
            <Button href="/projects">ادعم مشروعًا</Button>
          </div>
        </section>
      </main>
      <SiteFooter />
      <StickyDonateBar />
    </>
  );
}