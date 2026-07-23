import { ArrowLeft, HandHeart } from "lucide-react";
import { Button } from "@/components/ui/button";

const suggestions = [
  { label: "زكاة لفلسطين", href: "/zakat", tone: "zakat" },
  { label: "وقف للقدس", href: "/waqf", tone: "waqf" },
  { label: "إغاثة غزة", href: "/projects?region=gaza", tone: "urgent" },
] as const;

export function BasketEmptyState({ onNavigate, page = false }: { onNavigate?: () => void; page?: boolean }) {
  return (
    <section className={`giving-basket-empty${page ? " giving-basket-empty--page" : ""}`} data-basket-empty>
      <span className="giving-basket-empty__icon" aria-hidden="true"><HandHeart size={28} /></span>
      <h1>{page ? "سلتك فارغة" : undefined}</h1>
      {!page ? <h3>سلتك فارغة</h3> : null}
      <p>لم تضف أي تبرع إلى السلة بعد. اختر مشروعًا وحدد المبلغ، ثم أضفه إلى السلة.</p>
      <Button href="/projects" onClick={onNavigate}>استكشف المشاريع</Button>
      <div className="basket-starting-points">
        <span>مشاريع مقترحة</span>
        <div>
          {suggestions.map((suggestion) => (
            <a className={`basket-starting-point basket-starting-point--${suggestion.tone}`} href={suggestion.href} key={suggestion.label} onClick={onNavigate}>
              <strong>{suggestion.label}</strong>
              <ArrowLeft size={15} aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
