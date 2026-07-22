import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export function AccountSignIn() {
  return (
    <main id="main-content" className="account-sign-in-page">
      <div className="account-sign-in-shell">
        <header>
          <a href="/" aria-label={siteConfig.nameAr}>
            <BrandMark compact />
            <span><strong>{siteConfig.nameAr}</strong><small>حساب العطاء</small></span>
          </a>
          <a href="/">العودة للموقع</a>
        </header>

        <section className="account-sign-in-card">
          <span>حساب العطاء</span>
          <h1>الدخول الآمن قيد التجهيز</h1>
          <p>سيتيح لك الحساب متابعة التبرعات والإيصالات وشهادات الوقف وخطط العطاء المستمر وتحديثات المشاريع من مكان واحد.</p>

          <div className="account-auth-required">
            <strong>لن نطلب بريدك أو رمز دخول قبل ربط خدمة المصادقة</strong>
            <ul>
              <li>دخول آمن دون عرض حسابات أو بيانات افتراضية.</li>
              <li>ربط التبرعات بالمتبرع بعد التحقق من الهوية.</li>
              <li>حماية الوثائق والتحديثات من الوصول غير المصرح.</li>
            </ul>
          </div>

          <div className="account-sign-in-actions">
            <Button href="/projects">استكشف المشاريع</Button>
            <Button href="mailto:info@minberiaksa.org" variant="outline">تواصل مع المؤسسة</Button>
          </div>

          <small>لن تُفتح مساحة الحساب أو تظهر بيانات المتبرعين قبل تفعيل المصادقة وربط النظام التشغيلي.</small>
        </section>
      </div>
    </main>
  );
}
