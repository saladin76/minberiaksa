import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import "../../../styles/project-detail.css";

export default function ProjectDetailLayout({ children }: { children: ReactNode }) {
  return <><TopUtilityBar /><SiteHeader />{children}<SiteFooter /></>;
}
