import { utilityNavigation } from "@/config/navigation";
import { Container } from "@/components/ui/container";

export function TopUtilityBar() {
  return (
    <div className="top-utility-bar">
      <Container className="top-utility-inner">
        <p>مشاريع القدس والأقصى وغزة · تبرع موثّق ومسارات عطاء مستقلة</p>
        <nav aria-label="روابط الثقة والمتابعة">
          {utilityNavigation.map((item) => (
            <a href={item.href} key={item.href}>{item.label}</a>
          ))}
        </nav>
      </Container>
    </div>
  );
}
