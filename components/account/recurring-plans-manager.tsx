import { Button } from "@/components/ui/button";

export function RecurringPlansManager() {
  return (
    <div className="account-page recurring-manager-page">
      <header className="account-page-heading">
        <span>العطاء المستمر</span>
        <h1>خطط عطائك المستمر</h1>
        <p>ستعرض هذه الصفحة خططك اليومية أو كل جمعة أو الشهرية بعد ربط الحساب بنظام الدفع المتكرر.</p>
      </header>

      <section className="account-empty-state">
        <h2>لا توجد خطط مرتبطة بالحساب بعد</h2>
        <p>عند تفعيل أول خطة حقيقية، ستظهر هنا الدورية والمبلغ والجهة وموعد العملية القادمة وحالة الخطة.</p>
        <div>
          <Button href="/recurring">أنشئ خطة عطاء</Button>
          <Button href="/projects" variant="outline">استكشف المشاريع</Button>
        </div>
      </section>

      <section className="account-account-roadmap">
        <h2>إدارة واضحة بعد التفعيل</h2>
        <div>
          <article>
            <span>01</span>
            <h3>تعديل المبلغ والدورية</h3>
            <p>تغيير قيمة العملية أو تكرارها بعد تأكيد هوية المتبرع.</p>
          </article>
          <article>
            <span>02</span>
            <h3>تغيير جهة العطاء</h3>
            <p>نقل الخطة إلى مشروع مؤهل أو صندوق عام دون إنشاء خطة مكررة.</p>
          </article>
          <article>
            <span>03</span>
            <h3>الإيقاف أو الإنهاء</h3>
            <p>إيقاف الخطة مؤقتًا أو إنهاؤها وفق السياسة التشغيلية المعتمدة.</p>
          </article>
        </div>
      </section>

      <section className="account-auth-required">
        <strong>إدارة الخطط تحتاج تسجيل دخول وربطًا ببوابة الدفع</strong>
        <p>لا تُعرض خطة أو عملية قادمة قبل استلام بياناتها من النظام التشغيلي الفعلي.</p>
      </section>
    </div>
  );
}