"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, Code, Heading, Image as ImageIcon, Minus, MousePointerClick, MoveVertical, Type, UserCircle, type LucideIcon } from "lucide-react";
import type { EmailDocument, AddableBlock } from "./types";
import { ADDABLE_BLOCKS, getRoot, getBlock, makeBlock, setRootChildren } from "./types";
import { dt } from "@/lib/dashboard/i18n";

interface Props {
  doc: EmailDocument;
  selectedId: string | null;
  onChange: (next: EmailDocument) => void;
  onSelect: (id: string | null) => void;
}

const BLOCK_ICONS: Record<string, LucideIcon> = {
  Heading,
  Text: Type,
  Button: MousePointerClick,
  Image: ImageIcon,
  Avatar: UserCircle,
  Divider: Minus,
  Spacer: MoveVertical,
  Html: Code,
};

export function BlockList({ doc, selectedId, onChange, onSelect }: Props) {
  const root = getRoot(doc);
  const childrenIds = root.childrenIds;

  const move = (idx: number, delta: number) => {
    const next = [...childrenIds];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(setRootChildren(doc, next));
  };

  const addBlock = (b: AddableBlock) => {
    const { id, block } = makeBlock(b.type);
    const next = {
      ...(doc as Record<string, unknown>),
      [id]: block,
    } as EmailDocument;
    onChange(setRootChildren(next, [...childrenIds, id]));
    onSelect(id);
  };

  return (
    <div className="space-y-2.5">
      {/* The palette sits first, so adding a block never means scrolling past a long email. */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-slate-500">{dt("إضافة كتلة")}</p>
        <div className="grid grid-cols-4 gap-1">
          {ADDABLE_BLOCKS.map((b) => {
            const Icon = BLOCK_ICONS[b.type] ?? Type;
            return (
              <button
                key={b.type}
                type="button"
                onClick={() => addBlock(b)}
                title={b.description}
                className="flex flex-col items-center gap-0.5 rounded-md border border-border bg-white px-1 py-1.5 text-[10px] font-medium leading-tight text-slate-600 transition-colors hover:border-[#025EB8]/60 hover:bg-[#025EB8]/5 hover:text-[#025EB8]"
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="w-full truncate text-center">{b.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border pt-2.5">
        <div
          onClick={() => onSelect("root")}
          className={cn(
            "rounded-md border px-2.5 py-1.5 cursor-pointer transition-colors text-start",
            selectedId === "root" || !selectedId
              ? "border-[#025EB8] bg-[#025EB8]/5"
              : "border-border hover:border-[#025EB8]/50"
          )}
        >
          <div className="text-xs font-semibold text-slate-700">{dt("إعدادات البريد")}</div>
          <div className="text-[11px] text-muted-foreground">{dt("الألوان والخط والخلفية")}</div>
        </div>
      </div>

      <div className="space-y-1">
        {childrenIds.length === 0 && (
          <div className="text-center text-xs text-muted-foreground p-4 border border-dashed border-border rounded-md">
            {dt("البريد فارغ، أضف كتلة من القائمة أعلاه")}</div>
        )}
        {childrenIds.map((id, idx) => {
          const block = getBlock(doc, id);
          if (!block) return null;
          const summary = blockSummary(block);
          const selected = selectedId === id;
          return (
            <div
              key={id}
              onClick={() => onSelect(id)}
              className={cn(
                "rounded-md border px-2 py-1 cursor-pointer transition-colors flex items-center gap-1.5",
                selected
                  ? "border-[#025EB8] bg-[#025EB8]/5"
                  : "border-border hover:border-[#025EB8]/50 bg-white"
              )}
            >
              {React.createElement(BLOCK_ICONS[block.type] ?? Type, { className: "w-3.5 h-3.5 text-slate-400 shrink-0" })}
              <div className="flex-1 min-w-0 text-start">
                <div className="truncate text-xs text-slate-700" title={summary}>
                  <span className="me-1 text-[10px] font-semibold uppercase text-slate-400">{block.type}</span>{" "}
                  {summary || "—"}
                </div>
              </div>
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    move(idx, -1);
                  }}
                  disabled={idx === 0}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={dt("نقل لأعلى")}
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    move(idx, 1);
                  }}
                  disabled={idx === childrenIds.length - 1}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={dt("نقل لأسفل")}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

function blockSummary(block: { type: string; data: { props?: Record<string, unknown> } }): string {
  const p = block.data.props as Record<string, unknown> | undefined;
  if (!p) return "";
  if (typeof p.text === "string") return p.text;
  if (typeof p.url === "string") return p.url;
  if (block.type === "Spacer") return `${p.height ?? 24}px`;
  if (block.type === "Divider") return dt("خط فاصل");
  return "";
}
