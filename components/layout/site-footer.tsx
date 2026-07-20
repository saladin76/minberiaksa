import { footerNavigation } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { BrandMark } from "@/components/ui/brand-mark";
import { Container } from "@/components/ui/container";
import { CurrencySelector } from "@/components/ui/currency-selector";
import { LanguageSelector } from "@/components/ui/language-selector";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer" id="contact">
      <Container>
        <div className="footer-main-grid">
          <div className="footer-brand-column">
            <BrandMark /><h2>{siteConfig.nameAr}</h2><p className="footer-name-en">{siteConfig.nameEn}</p><p>{siteConfig.description}</p>
            <address><a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>{siteConfig.phones.map((phone) => <a key={phone} href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>)}<span>{siteConfig.address}</span></address>
          </div>
          {Object.values(footerNavigation).map((column) => <nav className="footer-link-column" aria-label={column.title} key={column.title}><h3>{column.title}</h3>{column.links.map((item) => <a key={item.label} href={item.href}>{item.label}</a>)}</nav>)}
        </div>
        <div className="footer-controls-row">
          <div className="footer-selectors"><LanguageSelector compact /><CurrencySelector compact /></div>
          <div className="social-placeholders" aria-label="روابط التواصل الاجتماعي غير متاحة حاليًا"><button type="button" disabled>IG</button><button type="button" disabled>FB</button><button type="button" disabled>YT</button></div>
        </div>
        <div className="footer-bottom-row"><p>© {year} {siteConfig.nameAr}. جميع الحقوق محفوظة.</p><p>Frontend prototype · لا توجد عمليات دفع أو حفظ بيانات.</p></div>
      </Container>
    </footer>
  );
}
