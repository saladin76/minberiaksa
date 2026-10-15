"use client";

import {
  Bot, FolderOpen, Image as ImageIcon, Link2, Settings, Sparkles, FileBarChart, FolderKanban,
} from "lucide-react";
import { SubNav, type SubNavItem } from "@/components/dashboard/SubNav";
import { dt } from "@/lib/dashboard/i18n";

// The archive cluster has EIGHT live pages but only one sidebar entry
// ("/dashboard/archive/collections"), so the other seven were reachable only through links
// buried inside ArchiveConsole. Routes that next.config.ts redirects away
// (/dashboard/archive, /archive/documents, /archive/marketing-files) are deliberately absent.
const ITEMS: SubNavItem[] = [
  { get label() { return dt("المجموعات"); }, href: "/dashboard/archive/collections", icon: FolderOpen },
  { get label() { return dt("الأصول"); }, href: "/dashboard/archive/assets", icon: ImageIcon },
  { get label() { return dt("المشاريع"); }, href: "/dashboard/archive/projects", icon: FolderKanban },
  { get label() { return dt("مختارات التسويق"); }, href: "/dashboard/archive/marketing-picks", icon: Sparkles },
  { get label() { return dt("روابط درايف"); }, href: "/dashboard/archive/drive-links", icon: Link2 },
  { get label() { return dt("التقارير"); }, href: "/dashboard/archive/reports", icon: FileBarChart },
  { get label() { return dt("المساعد الذكي"); }, href: "/dashboard/archive/ai", icon: Bot },
  { get label() { return dt("الإعدادات"); }, href: "/dashboard/archive/settings", icon: Settings },
];

export function ArchiveSubNav() {
  return <SubNav items={ITEMS} />;
}
