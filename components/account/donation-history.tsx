import { Button } from "@/components/ui/button";

export function DonationHistory() {
  return (
    <div className="account-page donation-history-page">
      <header className="account-page-heading">
        <span>تبرعاتي</span>
        <h1>سجل التبرعات</h1>
        <p>تظهر هنا تبرعاتك بعد تسجيل الدخول.</p>
      </header>

      <section className="account-empty-records">
        <div>
          <span>لا توجد تبرعات حتى الآن</span>
          <h2>اختر مشروعًا وابدأ تبرعك</h2>
          <p>بعد إتمام التبرع، ستجد هنا المشروع والمبلغ والعملة وحالة الوثائق.</p>
        </div>
        <div className="account-empty-features">
          <article><strong>تفاصيل التبرع</strong><p>المشروع والمبلغ والعملة.</p></article>
          <article><strong>الوثائق</strong><p>تظهر الإيصالات أو الشهادات بعد إصدارها.</p></article>
          <article><strong>التحديثات</strong><p>تظهر التحديثات المنشورة للمشروع.</p></article>
        </div>
        <div className="account-empty-actions">
          <Button href="/projects">استكشف المشاريع</Button>
          <Button href="/zakat" variant="outline">احسب زكاتك</Button>
          <Button href="/waqf" variant="outline">اختر مشروع وقف</Button>
        </div>
      </section>
    </div>
  );
}
