import { ContentSuiteNavigation } from "@/components/dashboard/content-editor/ContentSuiteNavigation";

export default function VideosLayout({ children }: { children: React.ReactNode }) {
  return <><ContentSuiteNavigation />{children}</>;
}
