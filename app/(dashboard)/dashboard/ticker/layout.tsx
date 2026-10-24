import { ContentSuiteNavigation } from "@/components/dashboard/content-editor/ContentSuiteNavigation";

export default function TickerLayout({ children }: { children: React.ReactNode }) {
  return <><ContentSuiteNavigation />{children}</>;
}
