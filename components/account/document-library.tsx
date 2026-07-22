import { Button } from "@/components/ui/button";

export function DocumentLibrary() {
  return (
    <div className="account-page document-library-page">
      <header className="account-page-heading">
        <span>الوثائق والشهادات</span>
        <h1>وثائق عطائك في مكان واحد</h1>
        <p>تظهر الإيصالات وشهادات الوقف وبطاقات الإهداء والتقارير بعد إصدارها واعتمادها رسميًا.</p>
      </header>

      <section className="account-empty-records">
        <div>
          <span>لا توجد وثائق صادرة بعد</span>
          <h2>لن نعرض مستندًا أو رقمًا مرجعيًا قبل إنشائه فعليًا</h2>
          <p>عند اكتمال عملية تبرع مرتبطة بحسابك، تظهر الوثيقة هنا بحالتها وتاريخ إصدارها والمشروع المرتبط بها.</p>
        </div>

        <div className="account-empty-features">
          <article><strong>إيصالات التبرعات</strong><p>ترتبط بالمبلغ والعملة والنية والعملية الفعلية.</p></article>
          <article><strong>شهادات الوقف</strong><p>تُبنى من بيانات صاحب الوقف والمشروع بعد اعتمادها.</p></article>
          <article><strong>التقارير الميدانية</strong><p>تظهر فقط عند نشر تقرير معتمد للمشروع.</p></article>
        </div>

        <div className="account-empty-actions">
          <Button href="/account/donations">سجل التبرعات</Button>
          <Button href="/waqf" variant="outline">أنشئ وقفًا</Button>
          <Button href="/impact" variant="outline">مركز الأثر والتقارير</Button>
        </div>
      </section>
    </div>
  );
}