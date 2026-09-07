"use client";

import {
  Bot, FolderOpen, Image as ImageIcon, Link2, Settings, Sparkles, FileBarChart, FolderKanban,
} from "lucide-react";
import { SubNav, type SubNavItem } from "@/components/dashboard/SubNav";

// The archive cluster has EIGHT live pages but only one sidebar entry
// ("/dashboard/archive/collections"), so the other seven were reachable only through links
// buried inside ArchiveConsole. Routes that next.config.ts redirects away
// (/dashboard/archive, /archive/documents, /archive/marketing-files) are deliberately absent.
const ITEMS: SubNavItem[] = [
  { label: "المجموعات", href: "/dashboard/archive/collections", icon: FolderOpen },
  { label: "الأصول", href: "/dashboard/archive/assets", icon: ImageIcon },
  { label: "المشاريع", href: "/dashboard/archive/projects", icon: FolderKanban },
  { label: "مختارات التسويق", href: "/dashboard/archive/marketing-picks", icon: Sparkles },
  { label: "روابط درايف", href: "/dashboard/archive/drive-links", icon: Link2 },
  { label: "التقارير", href: "/dashboard/archive/reports", icon: FileBarChart },
  { label: "المساعد الذكي", href: "/dashboard/archive/ai", icon: Bot },
  { label: "الإعدادات", href: "/dashboard/archive/settings", icon: Settings },
];

export function ArchiveSubNav() {
  return <SubNav items={ITEMS} />;
}
