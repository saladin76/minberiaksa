import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { CompactFooter } from "@/components/layout/compact-footer";
import { siteConfig } from "@/config/site";

export function AccountSignIn() {
  return (
    <div className="account-sign-in-layout">
      <main id="main-content" className="account-sign-in-page">
        <div className="account-sign-in-shell">
          <header>
            <a href="/" aria-label={siteConfig.nameAr}>
              <BrandMark compact />
              <span><strong>{siteConfig.nameAr}</strong><small>حساب المتبرع</small></span>
            </a>
            <a href="/">العودة إلى الموقع</a>
          </header>

          <section className="account-sign-in-card">
            <span>حساب المتبرع</span>
            <h1>تسجيل الدخول غير متاح حاليًا</h1>
            <p>سيتيح لك الحساب مراجعة تبرعاتك ووثائقك وتحديث بياناتك عند تفعيله.</p>

            <div className="account-auth-required">
              <strong>لن تظهر أي بيانات شخصية قبل تسجيل الدخول</strong>
              <ul>
                <li>تبرعاتك ووثائقك تبقى خاصة.</li>
                <li>تظهر بيانات الحساب بعد التحقق من تسجيل الدخول.</li>
                <li>يمكنك متابعة المشاريع من الموقع دون حساب.</li>
              </ul>
            </div>

            <div className="account-sign-in-actions">
              <Button href="/projects">استكشف المشاريع</Button>
              <Button href="mailto:info@minberiaksa.org" variant="outline">تواصل معنا</Button>
            </div>

            <small>سيظهر نموذج تسجيل الدخول هنا بعد تفعيل الحساب.</small>
          </section>
        </div>
      </main>
      <CompactFooter selectors={false} />
    </div>
  );
}
