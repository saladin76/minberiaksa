"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, GripVertical, LayoutTemplate, ListOrdered, Lock, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  HOME_LISTS,
  HOME_SECTIONS,
  HOME_SORT_LABELS,
  type HomeLayoutConfig,
  type HomeListConfig,
  type HomeSectionId,
  type HomeSectionKind,
} from "@/lib/minbar/home-layout";
import { useDragReorder } from "./reorder";
import { dt } from "@/lib/dashboard/i18n";

const KIND_ICON: Record<HomeSectionKind, typeof ListOrdered> = {
  list: ListOrdered,
  static: LayoutTemplate,
  banners: Megaphone,
};

/** One line saying how a list picks its items, for the row under the section's name. */
export function listSummary(config: HomeListConfig): string {
  if (!config.show) return dt("مخفي");
  const count = config.limit === 0 ? dt("الكل") : String(config.limit);
  if (config.mode === "manual") return dt("يدوي · {0} عنصر", [config.ids.length]);
  if (config.mode === "pinned") return dt("{0} مثبّت + {1} · {2}", [config.ids.length, HOME_SORT_LABELS[config.sort], count]);
  return `${HOME_SORT_LABELS[config.sort]} · ${count}`;
}

function sectionSummary(id: HomeSectionId, layout: HomeLayoutConfig): string {
  const meta = HOME_SECTIONS[id];
  if (meta.kind === "banners") return dt("من صفحة البانرات");
  if (meta.kind === "static") return dt("قسم ثابت التصميم");
  return meta.lists
    .map((listId) => (meta.lists.length > 1 ? `${HOME_LISTS[listId].label}: ${listSummary(layout.lists[listId])}` : listSummary(layout.lists[listId])))
    .join(" — ");
}

function LockedRow({ title, hint, href }: { title: string; hint: string; href?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/40 px-3 py-2.5">
      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      {href && (
        <Link href={href} className="shrink-0 text-xs font-medium text-primary hover:underline">
          {dt("إعداداته")}</Link>
      )}
    </div>
  );
}

export function SectionList({
  layout,
  selected,
  onSelect,
  onMove,
  onToggle,
}: {
  layout: HomeLayoutConfig;
  selected: HomeSectionId;
  onSelect: (id: HomeSectionId) => void;
  onMove: (from: number, to: number) => void;
  onToggle: (id: HomeSectionId, enabled: boolean) => void;
}) {
  const { rowProps, dragging } = useDragReorder(onMove);
  const last = layout.sections.length - 1;

  return (
    <div className="space-y-2">
      <LockedRow title={dt("الواجهة الرئيسية")} hint={dt("أعلى الصفحة دائمًا · القصص والفيديو التعريفي")} />
      <LockedRow title={dt("التبرع السريع")} hint={dt("مثبّت تحت الواجهة بحسب التصميم")} href="/dashboard/quick-donation" />

      <ol className="space-y-1.5 pt-1">
        {layout.sections.map((section, index) => {
          const meta = HOME_SECTIONS[section.id];
          const Icon = KIND_ICON[meta.kind];
          const active = section.id === selected;
          return (
            <li
              key={section.id}
              {...rowProps(index)}
              className={`group flex items-center gap-2 rounded-xl border px-2 py-2 transition-colors ${
                active ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-background hover:bg-muted/50"
              } ${dragging === index ? "shadow-md" : ""} ${section.enabled ? "" : "opacity-55"}`}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
              <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">{index + 1}</span>
              <button type="button" onClick={() => onSelect(section.id)} className="flex min-w-0 flex-1 items-center gap-2 text-start">
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-medium ${section.enabled ? "" : "line-through"}`}>{meta.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{section.enabled ? sectionSummary(section.id, layout) : dt("مخفي من الصفحة")}</span>
                </span>
                <ChevronLeft className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-transparent group-hover:text-muted-foreground"}`} />
              </button>
              <div className="flex shrink-0 items-center">
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label={dt("نقل «{0}» لأعلى", [meta.label])}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={index === last} onClick={() => onMove(index, index + 1)} aria-label={dt("نقل «{0}» لأسفل", [meta.label])}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Switch checked={section.enabled} onCheckedChange={(v) => onToggle(section.id, v)} aria-label={dt("إظهار «{0}»", [meta.label])} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
