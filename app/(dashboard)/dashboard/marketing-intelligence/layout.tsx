import type { ReactNode } from "react";
import { MarketingIntelligenceStatusBar } from "./MarketingIntelligenceStatusBar";

export default function MarketingIntelligenceLayout({ children }: { children: ReactNode }) {
  return <>
    <MarketingIntelligenceStatusBar />
    {children}
  </>;
}
