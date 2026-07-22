import { Button } from "@/components/ui/button";

export function ImpactWallet() {
  return (
    <div className="account-page impact-wallet-page">
      <header className="account-page-heading">
        <span>رحلة الأثر</span>
        <h1>محفظة أثر عطائك</h1>
        <p>تجمع هذه المساحة المشاريع التي ساهمت فيها، وتحديثات التنفيذ، والتقارير والوثائق المرتبطة بكل نية.</p>
        <a className="text-link" href="/impact">عرض مركز الأثر العام</a>
      </header>

      <section className="impact-editorial-summary">
        <div>
          <span>ليست محفظة مالية</span>
          <h2>من المساهمة إلى المشروع، ثم إلى التحديث والتقرير</h2>
          <p>لا تعرض هذه الصفحة رصيدًا أو أرباحًا. هدفها توثيق رحلة عطائك وربطها بما نُشر واعتمد من الميدان.</p>
        </div>
        <ul>
          <li>كل نية تبقى مستقلة.</li>
          <li>لا تظهر أرقام أثر قبل توثيقها.</li>
          <li>تُربط الوثائق بالمشروع والمساهمة.</li>
          <li>تظهر التحديثات الميدانية بعد اعتمادها.</li>
        </ul>
      </section>

      <section className="impact-timeline-section" aria-labelledby="impact-timeline-title">
        <header>
          <span>التحديثات المرتبطة بعطائك</span>
          <h2 id="impact-timeline-title">لا توجد رحلة أثر مرتبطة بالحساب بعد</h2>
        </header>
        <div className="account-empty-state">
          <h3>ستظهر مساهماتك الموثقة هنا</h3>
          <p>بعد ربط الحساب بعملية تبرع فعلية، ستظهر المشاريع والتحديثات والتقارير المتاحة دون بيانات أو نتائج تجريبية.</p>
          <div>
            <Button href="/projects">استكشف المشاريع</Button>
            <Button href="/impact" variant="outline">عرض تقارير الأثر العامة</Button>
          </div>
        </div>
      </section>

      <section className="account-account-roadmap">
        <h2>ما الذي ستتابعه من هذه الصفحة؟</h2>
        <div>
          <article><span>01</span><h3>المشروع والنية</h3><p>المشروع الذي ساهمت فيه ونوع العطاء المرتبط به.</p></article>
          <article><span>02</span><h3>مراحل التنفيذ</h3><p>التحديثات التي اعتمدها فريق المؤسسة ونشرها للمشروع.</p></article>
          <article><span>03</span><h3>التقارير والوثائق</h3><p>الوثائق الصادرة فعليًا والتقارير المتاحة للعرض أو التنزيل.</p></article>
        </div>
      </section>
    </div>
  );
}