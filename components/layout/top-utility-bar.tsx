import { utilityNavigation } from "@/config/navigation";
import { Container } from "@/components/ui/container";
import { CurrencySelector } from "@/components/ui/currency-selector";
import { LanguageSelector } from "@/components/ui/language-selector";
import { BasketTrigger } from "@/components/ui/basket-trigger";

export function TopUtilityBar() {
  return (
    <div className="top-utility-bar">
      <Container className="top-utility-inner">
        <nav className="utility-participation-links" aria-label="المشاركة مع المؤسسة">
          {utilityNavigation.map((item) => (
            <a href={item.href} key={item.label}>{item.label}</a>
          ))}
        </nav>

        <div className="utility-account-controls" aria-label="إعدادات التصفح والحساب">
          <div className="utility-selector-cluster" aria-label="اللغة والعملة">
            <LanguageSelector compact />
            <CurrencySelector compact />
          </div>
          <a className="utility-account-link" href="/account">حساب المتبرع</a>
          <BasketTrigger compact />
        </div>
      </Container>
    </div>
  );
}
