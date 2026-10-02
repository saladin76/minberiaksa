"use client";

import { useRef, useState, type DragEvent } from "react";

/** `items` with the entry at `from` moved to `to`. */
export function move<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Native drag-to-reorder for a vertical list. The list moves live while the
 * row is dragged, so what the admin sees under the pointer is the result.
 * Touch screens have no HTML5 drag; every list that uses this also offers
 * up/down buttons.
 */
export function useDragReorder(onMove: (from: number, to: number) => void) {
  const from = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const rowProps = (index: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      from.current = index;
      setDragging(index);
      e.dataTransfer.effectAllowed = "move";
      /* Firefox will not start a drag without data. */
      e.dataTransfer.setData("text/plain", String(index));
    },
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      if (from.current === null || from.current === index) return;
      onMove(from.current, index);
      from.current = index;
      setDragging(index);
    },
    onDrop: (e: DragEvent) => e.preventDefault(),
    onDragEnd: () => {
      from.current = null;
      setDragging(null);
    },
  });

  return { rowProps, dragging };
}
