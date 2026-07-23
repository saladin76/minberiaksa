import { Button } from "@/components/ui/button";

export function RecurringPlansManager() {
  return (
    <div className="account-page recurring-manager-page">
      <header className="account-page-heading">
        <span>التبرعات الدورية</span>
        <h1>التبرعات الدورية</h1>
        <p>تظهر هنا تبرعاتك اليومية أو الأسبوعية أو الشهرية بعد تسجيل الدخول.</p>
      </header>

      <section className="account-empty-state">
        <h2>لا توجد تبرعات دورية حاليًا</h2>
        <p>عند إنشاء تبرع دوري، ستجد هنا المشروع والمبلغ والتكرار والحالة.</p>
        <div>
          <Button href="/recurring">ابدأ تبرعًا دوريًا</Button>
          <Button href="/projects" variant="outline">استكشف المشاريع</Button>
        </div>
      </section>

      <section className="account-account-roadmap">
        <h2>إدارة التبرع الدوري</h2>
        <div>
          <article><span>01</span><h3>تعديل المبلغ والتكرار</h3><p>غيّر المبلغ أو موعد التبرع عند توفر الخدمة.</p></article>
          <article><span>02</span><h3>تغيير المشروع</h3><p>اختر مشروعًا آخر متاحًا للتبرع الدوري.</p></article>
          <article><span>03</span><h3>إيقاف أو إعادة التفعيل</h3><p>أوقف التبرع أو أعد تفعيله من حسابك.</p></article>
        </div>
      </section>

      <section className="account-auth-required">
        <strong>تسجيل الدخول مطلوب</strong>
        <p>سجّل الدخول لعرض التبرعات الدورية أو تعديلها.</p>
      </section>
    </div>
  );
}
