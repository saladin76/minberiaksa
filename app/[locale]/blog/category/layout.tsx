import type { ReactNode } from "react";
import LegacyMessages from "@/components/minbar/LegacyMessages";

export default async function LegacyLayout({ params, children }: { params: Promise<{ locale: string }>; children: ReactNode }) {
  const { locale } = await params;
  return <LegacyMessages locale={locale}>{children}</LegacyMessages>;
}
