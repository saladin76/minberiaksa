import { primaryNavigation } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { BasketTrigger } from "@/components/ui/basket-trigger";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { DesktopNavigation } from "./desktop-navigation";
import { MobileNavigation } from "./mobile-navigation";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Container className="site-header-inner">
        <a className="site-brand" href="/" aria-label={siteConfig.nameAr}>
          <BrandMark compact />
          <span className="site-brand-copy">
            <strong>{siteConfig.shortNameAr}</strong>
            <small>{siteConfig.nameEn}</small>
          </span>
        </a>

        <DesktopNavigation items={primaryNavigation} />

        <div className="desktop-header-actions">
          <Button href="/#donate" size="small">تبرع الآن</Button>
        </div>

        <div className="mobile-header-actions" aria-label="إجراءات الهاتف">
          <BasketTrigger compact />
          <MobileNavigation />
        </div>
      </Container>
    </header>
  );
}
