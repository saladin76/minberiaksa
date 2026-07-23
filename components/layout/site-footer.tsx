import { PatternBackground } from "@/components/brand/pattern-background";
import { footerNavigation } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { BrandMark } from "@/components/ui/brand-mark";
import { Container } from "@/components/ui/container";
import { CurrencySelector } from "@/components/ui/currency-selector";
import { LanguageSelector } from "@/components/ui/language-selector";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <PatternBackground intensity="soft" position="top" fadeDirection="bottom" variant="dark" className="footer-pattern-shell">
      <footer className="site-footer" id="contact">
        <Container>
          <div className="footer-main-grid">
            <div className="footer-brand-column">
              <BrandMark inverse />
              <h2>{siteConfig.nameAr}</h2>
              <p className="footer-name-en">{siteConfig.nameEn}</p>
              <p>{siteConfig.description}</p>
              <address>
                <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>
                {siteConfig.phones.map((phone) => <a key={phone} href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>)}
                <span>{siteConfig.address}</span>
              </address>
            </div>

            <div className="footer-navigation-grid">
              {footerNavigation.map((column) => (
                <nav className="footer-link-column" aria-label={column.title} key={column.title}>
                  <h3>{column.title}</h3>
                  {column.links.map((item) => (
                    <a key={item.label} href={item.href} target={"external" in item && item.external ? "_blank" : undefined} rel={"external" in item && item.external ? "noreferrer" : undefined}>{item.label}</a>
                  ))}
                </nav>
              ))}
            </div>
          </div>

          <div className="footer-controls-row">
            <p>اختر لغتك وعملتك دون حذف أي خيار متاح في المنصة.</p>
            <div className="footer-selectors"><LanguageSelector compact /><CurrencySelector compact /></div>
          </div>

          <div className="footer-bottom-row" id="legal">
            <p>© {year} {siteConfig.nameAr}. جميع الحقوق محفوظة.</p>
            <p>تعرض الوثائق والتقارير وفق حالة اعتمادها الفعلية.</p>
          </div>
        </Container>
      </footer>
    </PatternBackground>
  );
}
