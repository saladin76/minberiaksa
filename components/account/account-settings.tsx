import { Button } from "@/components/ui/button";

export function AccountSettings() {
  return (
    <div className="account-page account-settings-page">
      <header className="account-page-heading">
        <span>بيانات الحساب</span>
        <h1>إعدادات الحساب</h1>
        <p>يمكنك تحديث بياناتك وتفضيلاتك بعد تسجيل الدخول.</p>
      </header>

      <section className="account-empty-state">
        <h2>تسجيل الدخول مطلوب</h2>
        <p>سجّل الدخول لعرض بيانات الحساب أو تعديلها.</p>
        <Button href="/account/sign-in">تسجيل الدخول</Button>
      </section>

      <section className="settings-section">
        <h2>ما الذي يمكنك تعديله؟</h2>
        <div className="account-account-roadmap">
          <div>
            <article><span>01</span><h3>البيانات الأساسية</h3><p>الاسم ووسائل التواصل والدولة.</p></article>
            <article><span>02</span><h3>اللغة والعملة</h3><p>لغة الحساب وعملة العرض.</p></article>
            <article><span>03</span><h3>تفضيلات التواصل</h3><p>الرسائل والتحديثات التي ترغب في تلقيها.</p></article>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>الخصوصية وطلبات البيانات</h2>
        <p>للاستفسار عن تعديل البيانات أو حذف الحساب، تواصل مع المؤسسة.</p>
        <div className="settings-actions">
          <a href="mailto:info@minberiaksa.org">تواصل معنا</a>
          <a href="/knowledge">المعرفة</a>
        </div>
      </section>

      <section className="account-auth-required">
        <strong>لن تُحفظ أي تغييرات قبل تسجيل الدخول</strong>
        <p>هذا يحمي بيانات حسابك.</p>
      </section>
    </div>
  );
}
