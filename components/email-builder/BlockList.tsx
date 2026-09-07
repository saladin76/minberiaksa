"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import type { EmailDocument, AddableBlock } from "./types";
import { ADDABLE_BLOCKS, getRoot, getBlock, makeBlock, setRootChildren } from "./types";

interface Props {
  doc: EmailDocument;
  selectedId: string | null;
  onChange: (next: EmailDocument) => void;
  onSelect: (id: string | null) => void;
}

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
    <div className="space-y-3">
      <div>
        <div
          onClick={() => onSelect("root")}
          className={cn(
            "rounded-lg border-2 px-3 py-2 cursor-pointer transition-colors text-right",
            selectedId === "root" || !selectedId
              ? "border-[#025EB8] bg-[#025EB8]/5"
              : "border-border hover:border-[#025EB8]/50"
          )}
        >
          <div className="text-xs font-semibold text-slate-700">إعدادات البريد</div>
          <div className="text-[11px] text-muted-foreground">الألوان والخط والخلفية</div>
        </div>
      </div>

      <div className="space-y-1.5">
        {childrenIds.length === 0 && (
          <div className="text-center text-sm text-muted-foreground p-6 border-2 border-dashed border-border rounded-lg">
            البريد فارغ — أضف كتلة من القائمة أدناه
          </div>
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
                "rounded-lg border-2 px-3 py-2 cursor-pointer transition-colors flex items-center gap-2",
                selected
                  ? "border-[#025EB8] bg-[#025EB8]/5"
                  : "border-border hover:border-[#025EB8]/50 bg-white"
              )}
            >
              <GripVertical className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0 text-right">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">{block.type}</div>
                <div className="text-xs text-slate-700 truncate" title={summary}>{summary || "—"}</div>
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
                  aria-label="نقل لأعلى"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    move(idx, 1);
                  }}
                  disabled={idx === childrenIds.length - 1}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="نقل لأسفل"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-[11px] font-semibold text-slate-500 mb-2">إضافة كتلة</p>
        <div className="grid grid-cols-2 gap-1.5">
          {ADDABLE_BLOCKS.map((b) => (
            <Button
              key={b.type}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addBlock(b)}
              className="justify-start text-xs h-auto py-2 flex-col items-start gap-0.5"
            >
              <span className="font-semibold">{b.label}</span>
              <span className="text-[10px] text-muted-foreground font-normal">{b.description}</span>
            </Button>
          ))}
        </div>
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
  if (block.type === "Divider") return "خط فاصل";
  return "";
}
