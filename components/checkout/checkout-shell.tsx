import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { siteConfig } from "@/config/site";

export function CheckoutShell({ children }: { children: ReactNode }) {
  return <div className="checkout-journey-shell">
    <header className="checkout-journey-header"><div className="site-container"><a className="checkout-brand" href="/" aria-label={`العودة إلى ${siteConfig.nameAr}`}><BrandMark compact /><span><strong>{siteConfig.nameAr}</strong><small>{siteConfig.nameEn}</small></span></a><div className="checkout-header-trust"><span>مراجعة واضحة</span><span>دفع آمن مستقبلًا</span><span>إيصالات منفصلة</span></div><a className="checkout-back-link" href="/">العودة للموقع</a></div></header>
    {children}
    <footer className="checkout-legal-footer"><div className="site-container"><p>Frontend Prototype · لا تتم معالجة دفعات أو حفظ بيانات شخصية.</p><div><a href="/#contact">التواصل</a><button type="button" disabled>الخصوصية — LEGAL CONTENT REQUIRED</button></div></div></footer>
  </div>;
}
