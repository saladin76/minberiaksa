import { Button } from "@/components/ui/button";

export function ImpactWallet() {
  return (
    <div className="account-page impact-wallet-page">
      <header className="account-page-heading">
        <span>التقارير والتحديثات</span>
        <h1>تحديثات المشاريع التي دعمتها</h1>
        <p>تظهر هنا التقارير والوثائق المنشورة للمشاريع المرتبطة بتبرعاتك.</p>
        <a className="text-link" href="/impact">عرض جميع التقارير</a>
      </header>

      <section className="impact-editorial-summary">
        <div>
          <span>معلومات المشروع</span>
          <h2>التبرع والمشروع والتحديثات</h2>
          <p>تظهر المعلومات بعد نشرها واعتمادها من المؤسسة.</p>
        </div>
        <ul>
          <li>يظهر نوع التبرع مع المشروع.</li>
          <li>لا تظهر أرقام غير معتمدة.</li>
          <li>تظهر الوثائق المرتبطة بالمشروع.</li>
          <li>تظهر التحديثات بعد نشرها.</li>
        </ul>
      </section>

      <section className="impact-timeline-section" aria-labelledby="impact-timeline-title">
        <header>
          <span>تحديثات المشاريع</span>
          <h2 id="impact-timeline-title">لا توجد تحديثات مرتبطة بحسابك حاليًا</h2>
        </header>
        <div className="account-empty-state">
          <h3>لا توجد تقارير منشورة حاليًا</h3>
          <p>ستظهر هنا التحديثات والتقارير الخاصة بالمشاريع التي دعمتها.</p>
          <div>
            <Button href="/projects">استكشف المشاريع</Button>
            <Button href="/impact" variant="outline">عرض التقارير والتحديثات</Button>
          </div>
        </div>
      </section>

      <section className="account-account-roadmap">
        <h2>ما الذي يظهر في هذه الصفحة؟</h2>
        <div>
          <article><span>01</span><h3>المشروع</h3><p>اسم المشروع ونوع التبرع.</p></article>
          <article><span>02</span><h3>التحديثات</h3><p>آخر ما نشرته المؤسسة عن التنفيذ.</p></article>
          <article><span>03</span><h3>التقارير والوثائق</h3><p>الملفات المتاحة للعرض أو التنزيل.</p></article>
        </div>
      </section>
    </div>
  );
}
