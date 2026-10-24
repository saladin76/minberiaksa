import { ContentSuiteNavigation } from "@/components/dashboard/content-editor/ContentSuiteNavigation";

export default function StoriesLayout({ children }: { children: React.ReactNode }) {
  return <><ContentSuiteNavigation />{children}</>;
}
