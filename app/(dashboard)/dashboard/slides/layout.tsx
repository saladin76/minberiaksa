import { ContentSuiteNavigation } from "@/components/dashboard/content-editor/ContentSuiteNavigation";

export default function SlidesLayout({ children }: { children: React.ReactNode }) {
  return <><ContentSuiteNavigation />{children}</>;
}
