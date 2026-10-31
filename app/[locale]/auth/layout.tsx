import type { Metadata } from "next";
import MinbarMessages from "@/components/minbar/MinbarMessages";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function NoIndexLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <MinbarMessages locale={locale} namespaces={["SignInPage", "SignInDialog", "CompleteProfile"]}>{children}</MinbarMessages>;
}
