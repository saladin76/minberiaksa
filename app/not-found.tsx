import { SiteHeader } from "@/components/layout/site-header";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import { CompactFooter } from "@/components/layout/compact-footer";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <TopUtilityBar />
      <SiteHeader />
      <main id="main-content" className="not-found-page">
        <div className="not-found-page__pattern" aria-hidden="true" />
        <section className="not-found-page__card">
          <BrandMark />
          <span>404</span>
          <h1>الصفحة غير موجودة</h1>
          <p>قد يكون الرابط غير صحيح أو تم نقل الصفحة.</p>
          <div>
            <Button href="/">العودة إلى الرئيسية</Button>
            <Button href="/projects" variant="outline">استكشف المشاريع</Button>
          </div>
        </section>
      </main>
      <CompactFooter selectors={false} />
    </>
  );
}
