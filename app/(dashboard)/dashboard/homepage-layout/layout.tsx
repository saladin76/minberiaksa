import { ContentSuiteNavigation } from "@/components/dashboard/content-editor/ContentSuiteNavigation";

export default function HomepageLayoutLayout({ children }: { children: React.ReactNode }) {
  return <><ContentSuiteNavigation />{children}</>;
}
