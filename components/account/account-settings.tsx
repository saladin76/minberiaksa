import { Button } from "@/components/ui/button";

export function AccountSettings() {
  return (
    <div className="account-page account-settings-page">
      <header className="account-page-heading">
        <span>إعدادات الحساب</span>
        <h1>إعدادات حساب العطاء</h1>
        <p>ستُدار بياناتك وتفضيلاتك من هذه الصفحة بعد تفعيل تسجيل الدخول وربط الحساب ببيانات المتبرع الفعلية.</p>
      </header>

      <section className="account-empty-state">
        <h2>الإعدادات غير مفعلة بعد</h2>
        <p>لا نعرض بيانات شخصية افتراضية، ولا نحفظ تغييرات محلية توحي بأنها مرتبطة بحساب حقيقي.</p>
        <Button href="/account/sign-in">الانتقال إلى تسجيل الدخول</Button>
      </section>

      <section className="settings-section">
        <h2>ما الذي ستتمكن من إدارته؟</h2>
        <div className="account-account-roadmap">
          <div>
            <article><span>01</span><h3>البيانات الأساسية</h3><p>الاسم ووسائل التواصل والدولة بعد التحقق من الحساب.</p></article>
            <article><span>02</span><h3>اللغة والعملة</h3><p>اختيار لغة الحساب وعملة العرض دون تغيير سجلات التبرعات الأصلية.</p></article>
            <article><span>03</span><h3>تفضيلات التواصل</h3><p>التحكم في تحديثات الأثر والإيصالات ورسائل الخطط المستمرة.</p></article>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>الخصوصية وطلبات البيانات</h2>
        <p>طلبات تصحيح البيانات أو تنزيلها أو حذف الحساب يجب أن تمر عبر مسار موثّق مرتبط بهوية المستخدم وسياسة المؤسسة.</p>
        <div className="settings-actions">
          <a href="mailto:info@minberiaksa.org">تواصل مع المؤسسة</a>
          <a href="/knowledge">مركز المعرفة</a>
        </div>
      </section>

      <section className="account-auth-required">
        <strong>لا تُجرى أي تغييرات قبل تفعيل المصادقة</strong>
        <p>هذا يمنع ظهور بيانات أو إعدادات محفوظة محليًا على أنها جزء من حساب فعلي.</p>
      </section>
    </div>
  );
}