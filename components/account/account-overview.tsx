import { Button } from "@/components/ui/button";
import { projects } from "@/data/projects";

export function AccountOverview() {
  const fieldProject = projects.find((project) => project.image);

  return (
    <div className="account-page account-overview-page">
      <header className="account-page-heading">
        <span>مساحة المتبرع</span>
        <h1>تابع عطائك من مكان واحد</h1>
        <p>تجمع مساحة المتبرع سجل المساهمات والوثائق وخطط العطاء وتحديثات المشاريع بعد ربط الحساب بالنظام التشغيلي.</p>
      </header>

      <section className="account-overview-hero" aria-labelledby="overview-summary-title">
        <div>
          <span>محفظة الأثر</span>
          <h2 id="overview-summary-title">العطاء رحلة مرتبطة بالمشروع، لا رصيدًا ماليًا</h2>
          <p>ستظهر مساهماتك هنا بعد تسجيل الدخول وربط العمليات بحسابك.</p>
        </div>
        <div className="account-overview-principles">
          <article><strong>سجل مستقل لكل نية</strong><p>الزكاة والوقف والعطاء المستمر تبقى منفصلة.</p></article>
          <article><strong>وثائق مرتبطة بالعملية</strong><p>تظهر الإيصالات والشهادات بعد إصدارها واعتمادها.</p></article>
          <article><strong>تحديثات من المشروع</strong><p>يصل كل تحديث إلى المساهمة المرتبطة به.</p></article>
        </div>
      </section>

      <section className="account-priority-panel">
        <header><span>ما الذي ستجده هنا؟</span><h2>مساحة واضحة لمتابعة رحلة عطائك</h2></header>
        <div>
          <a href="/account/donations"><strong>سجل التبرعات</strong><span>المبالغ والعملات والنيات والمشاريع المرتبطة.</span></a>
          <a href="/account/documents"><strong>الوثائق والشهادات</strong><span>الوصول إلى ما صدر رسميًا لكل عملية.</span></a>
          <a href="/account/recurring"><strong>خطط العطاء المستمر</strong><span>مراجعة الدورية والوجهة وحالة الخطة.</span></a>
        </div>
      </section>

      <section className="account-featured-impact">
        <div className="account-field-visual">
          {fieldProject?.image ? <img src={fieldProject.image.sourceUrl} alt={fieldProject.image.alt.ar} /> : <div role="img" aria-label="مشروعات المؤسسة في الميدان">مشروعات المؤسسة</div>}
        </div>
        <div>
          <span>الأثر المرتبط بعطائك</span>
          <h2>{fieldProject?.title.ar ?? "تابع المشروع الذي دعمته"}</h2>
          <p>عند نشر تحديث ميداني معتمد، يظهر داخل محفظة الأثر مرتبطًا بالمشروع والتبرع ذي الصلة.</p>
          <Button href="/account/impact">عرض محفظة الأثر</Button>
        </div>
      </section>

      <section className="account-quick-actions">
        <h2>الوصول إلى أقسام الحساب</h2>
        <div>
          <Button href="/account/impact">محفظة الأثر</Button>
          <Button href="/account/donations" variant="outline">سجل التبرعات</Button>
          <Button href="/account/documents" variant="outline">الوثائق</Button>
          <Button href="/account/recurring" variant="outline">العطاء المستمر</Button>
          <Button href="/projects" variant="text">استكشف مشروعًا جديدًا</Button>
        </div>
      </section>
    </div>
  );
}