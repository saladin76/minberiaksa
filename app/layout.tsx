import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BasketProvider } from "@/components/basket/basket-provider";
import { ImageFailureGuard } from "@/components/ui/image-failure-guard";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "./globals.css";
import "../styles/homepage.css";
import "../styles/projects.css";
import "../styles/project-cards.css";
import "../styles/zakat.css";
import "../styles/zakat-premium.css";
import "../styles/waqf.css";
import "../styles/waqf-responsive.css";
import "../styles/waqf-premium.css";
import "../styles/recurring.css";
import "../styles/recurring-responsive.css";
import "../styles/recurring-premium.css";
import "../styles/basket.css";
import "../styles/basket-responsive.css";
import "../styles/checkout.css";
import "../styles/account-integration.css";
import "../styles/account.css";
import "../styles/golden-identity.css";
import "../styles/selectors.css";
import "../styles/giving-pages-polish.css";
import "../styles/impact.css";
import "../styles/stories.css";
import "../styles/knowledge.css";
import "../styles/content-pages-polish.css";
import "../styles/about.css";
import "../styles/pattern-background.css";
import "../styles/pattern-asset-source.css";
import "../styles/platform-identity.css";
import "../styles/homepage-unified.css";
import "../styles/navigation-shell.css";
import "../styles/navigation-shell-responsive.css";
import "../styles/visual-ux-qa.css";
import "../styles/visual-reset-final.css";

export const metadata: Metadata = {
  title: "مؤسسة منبر الأقصى الدولية",
  description: "منصة عطاء مقدسية عالمية تربط مساهمتك بالمشروع والإيصال وتحديثات الأثر.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <a className="skip-link" href="#main-content">انتقل إلى المحتوى الرئيسي</a>
        <ImageFailureGuard />
        <BasketProvider>{children}</BasketProvider>
      </body>
    </html>
  );
}
