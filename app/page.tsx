import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { StickyDonateBar } from "@/components/layout/sticky-donate-bar";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function HomePage() {
  return (
    <>
      <TopUtilityBar /><SiteHeader />
      <main id="main-content">
        <section className="foundation-hero" id="top" aria-labelledby="foundation-hero-title">
          <Container className="foundation-hero-grid">
            <div className="foundation-hero-copy">
              <span className="hero-kicker">مؤسسة عالمية · أثر موثّق</span>
              <h1 id="foundation-hero-title">اجعل أثر عطائك واضحًا في القدس والأقصى وغزة.</h1>
              <p>منصة تبرعات مؤسسية تربط مساهمتك بالمشروع والإيصال وتحديثات الأثر.</p>
              <div className="hero-actions"><Button href="#donate" size="large">تبرع الآن</Button><Button href="#projects" variant="outline" size="large">استكشف المشاريع</Button></div>
              <ul className="hero-trust-list" aria-label="عناصر الثقة"><li>مسارات تبرع واضحة</li><li>إيصالات وتقارير تنفيذ</li><li>تجربة متعددة اللغات والعملات</li></ul>
            </div>
            <div className="foundation-visual-placeholder" role="img" aria-label="مساحة مخصصة للصورة الرسمية المعتمدة لاحقًا">
              <div className="visual-placeholder-grid" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
              <div className="visual-placeholder-copy"><strong>APPROVED FIELD IMAGE REQUIRED</strong><span>Professional visual placeholder · No AI image used</span></div>
            </div>
          </Container>
        </section>
        <section className="foundation-main-placeholder" id="projects" aria-labelledby="main-placeholder-title">
          <Container><div className="main-placeholder-frame"><span>HOMEPAGE CONTENT AREA</span><h2 id="main-placeholder-title">مساحة محتوى الصفحة الرئيسية</h2><p>هذه المساحة مخصصة لاختبار الـDesign Foundation والـResponsive Layout فقط. لن تُبنى أقسام الصفحة الرئيسية الكاملة قبل اعتماد هذه المرحلة.</p><div className="placeholder-rules" aria-label="نطاق المرحلة"><span>Design Tokens</span><span>UI Components</span><span>Responsive Foundation</span></div></div></Container>
        </section>
        <span id="donate" className="anchor-target" aria-hidden="true" /><span id="zakat" className="anchor-target" aria-hidden="true" /><span id="waqf" className="anchor-target" aria-hidden="true" /><span id="recurring" className="anchor-target" aria-hidden="true" /><span id="impact" className="anchor-target" aria-hidden="true" /><span id="knowledge" className="anchor-target" aria-hidden="true" /><span id="about" className="anchor-target" aria-hidden="true" />
      </main>
      <SiteFooter /><StickyDonateBar />
    </>
  );
}
