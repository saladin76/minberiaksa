import { Button } from "@/components/ui/button";

export function DonationHistory() {
  return (
    <div className="account-page donation-history-page">
      <header className="account-page-heading">
        <span>سجل التبرعات</span>
        <h1>كل مساهمة في سجل واضح</h1>
        <p>تظهر العمليات الفعلية هنا بعد ربط الحساب ببوابة الدفع ونظام التبرعات.</p>
      </header>

      <section className="account-empty-records">
        <div>
          <span>لا توجد عمليات مرتبطة بالحساب بعد</span>
          <h2>ابدأ أول مساهمة من المشروع الذي تختاره</h2>
          <p>عند اكتمال التبرع، يظهر هنا المبلغ والعملة والنية والمشروع وحالة الوثائق المرتبطة به.</p>
        </div>
        <div className="account-empty-features">
          <article><strong>فصل النيات</strong><p>الزكاة والوقف والصدقة والعطاء المستمر تبقى مستقلة.</p></article>
          <article><strong>تتبع الوثائق</strong><p>يظهر الإيصال أو الشهادة بعد إصدارها رسميًا.</p></article>
          <article><strong>الربط بالأثر</strong><p>ترتبط تحديثات المشروع بالمساهمة ذات الصلة.</p></article>
        </div>
        <div className="account-empty-actions">
          <Button href="/projects">استكشف المشاريع</Button>
          <Button href="/zakat" variant="outline">احسب زكاتك</Button>
          <Button href="/waqf" variant="outline">أنشئ وقفًا</Button>
        </div>
      </section>
    </div>
  );
}