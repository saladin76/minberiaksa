import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "مؤسسة منبر الأقصى الدولية",
  description:
    "منصة تبرعات دولية متخصصة في مشاريع القدس وغزة، والأوقاف والزكاة والإغاثة الميدانية.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
