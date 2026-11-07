import LegacyMessages from "@/components/minbar/LegacyMessages";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function NoIndexLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <LegacyMessages locale={locale}>{children}</LegacyMessages>;
}
