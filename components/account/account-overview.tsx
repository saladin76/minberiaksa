import { Button } from "@/components/ui/button";
import { projects } from "@/data/projects";

export function AccountOverview() {
  const fieldProject = projects.find((project) => project.image);

  return (
    <div className="account-page account-overview-page">
      <header className="account-page-heading">
        <span>حساب المتبرع</span>
        <h1>نظرة عامة</h1>
        <p>راجع تبرعاتك ووثائقك والتبرعات الدورية بعد تسجيل الدخول.</p>
      </header>

      <section className="account-overview-hero" aria-labelledby="overview-summary-title">
        <div>
          <span>حسابك</span>
          <h2 id="overview-summary-title">كل تبرعاتك في مكان واحد</h2>
          <p>تظهر بياناتك هنا بعد تسجيل الدخول.</p>
        </div>
        <div className="account-overview-principles">
          <article><strong>تبرعاتي</strong><p>المشاريع والمبالغ والعملات.</p></article>
          <article><strong>الوثائق</strong><p>الإيصالات والشهادات الصادرة.</p></article>
          <article><strong>التحديثات</strong><p>آخر ما نُشر عن المشاريع التي دعمتها.</p></article>
        </div>
      </section>

      <section className="account-priority-panel">
        <header><span>أقسام الحساب</span><h2>اختر ما تريد مراجعته</h2></header>
        <div>
          <a href="/account/donations"><strong>تبرعاتي</strong><span>المشاريع والمبالغ والعملات.</span></a>
          <a href="/account/documents"><strong>الوثائق</strong><span>الإيصالات والشهادات الصادرة.</span></a>
          <a href="/account/recurring"><strong>التبرعات الدورية</strong><span>المبلغ والتكرار والحالة.</span></a>
        </div>
      </section>

      <section className="account-featured-impact">
        <div className="account-field-visual">
          {fieldProject?.image ? <img src={fieldProject.image.sourceUrl} alt={fieldProject.image.alt.ar} /> : null}
        </div>
        <div>
          <span>تحديثات المشاريع</span>
          <h2>{fieldProject?.title.ar ?? "تابع المشروع الذي دعمته"}</h2>
          <p>تظهر هنا التحديثات المنشورة للمشاريع المرتبطة بتبرعاتك.</p>
          <Button href="/account/impact">عرض التقارير والتحديثات</Button>
        </div>
      </section>

      <section className="account-quick-actions">
        <h2>روابط الحساب</h2>
        <div>
          <Button href="/account/donations">تبرعاتي</Button>
          <Button href="/account/documents" variant="outline">الوثائق</Button>
          <Button href="/account/recurring" variant="outline">التبرعات الدورية</Button>
          <Button href="/account/settings" variant="outline">بيانات الحساب</Button>
          <Button href="/projects" variant="text">استكشف المشاريع</Button>
        </div>
      </section>
    </div>
  );
}
