import { BrandMark } from "@/components/ui/brand-mark";
import { CurrencySelector } from "@/components/ui/currency-selector";
import { LanguageSelector } from "@/components/ui/language-selector";
import { siteConfig } from "@/config/site";

export function CompactFooter({ selectors = true }: { selectors?: boolean }) {
  const year = new Date().getFullYear();
  return (
    <footer className="compact-footer">
      <div className="site-container compact-footer__inner">
        <a className="compact-footer__brand" href="/" aria-label={`العودة إلى ${siteConfig.nameAr}`}>
          <BrandMark compact inverse />
          <span><strong>{siteConfig.nameAr}</strong><small>{siteConfig.nameEn}</small></span>
        </a>
        <nav aria-label="روابط أساسية">
          <a href="/projects">المشاريع</a>
          <a href="/about">من نحن</a>
          <a href="/#contact">تواصل معنا</a>
        </nav>
        <div className="compact-footer__contact">
          <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>
          {siteConfig.phones[0] ? <a dir="ltr" href={`tel:${siteConfig.phones[0].replace(/\s/g, "")}`}>{siteConfig.phones[0]}</a> : null}
        </div>
        {selectors ? <div className="compact-footer__selectors"><LanguageSelector compact /><CurrencySelector compact /></div> : null}
        <p>© {year} {siteConfig.nameAr}. جميع الحقوق محفوظة.</p>
      </div>
    </footer>
  );
}
