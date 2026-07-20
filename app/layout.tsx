import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "../styles/homepage.css";
import "../styles/projects.css";
import "../styles/zakat.css";

export const metadata: Metadata = {
  title: "مؤسسة منبر الأقصى الدولية",
  description: "منصة تبرعات مؤسسية تربط مساهمتك بالمشروع والإيصال وتحديثات الأثر.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="ar" dir="rtl"><body><a className="skip-link" href="#main-content">انتقل إلى المحتوى الرئيسي</a>{children}</body></html>;
}
