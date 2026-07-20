import { primaryNavigation } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { BasketTrigger } from "@/components/ui/basket-trigger";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { CurrencySelector } from "@/components/ui/currency-selector";
import { LanguageSelector } from "@/components/ui/language-selector";
import { MobileNavigation } from "./mobile-navigation";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Container className="site-header-inner">
        <a className="site-brand" href="/" aria-label={siteConfig.nameAr}>
          <BrandMark compact />
          <span className="site-brand-copy"><strong>{siteConfig.nameAr}</strong><small>{siteConfig.nameEn}</small></span>
        </a>
        <nav className="desktop-navigation" aria-label="التنقل الرئيسي">
          {primaryNavigation.map((item) => <a key={item.label} href={item.href}>{item.label}</a>)}
        </nav>
        <div className="desktop-header-actions">
          <LanguageSelector compact /><CurrencySelector compact /><BasketTrigger compact /><Button href="/#donate" size="small">تبرع الآن</Button>
        </div>
        <div className="mobile-header-actions">
          <BasketTrigger compact /><Button href="/#donate" size="small">تبرع</Button><MobileNavigation />
        </div>
      </Container>
    </header>
  );
}
