'use client';

import { useCallback, useRef, type ReactNode } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { GripVertical } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

/**
 * A drag-to-reorder table for the site-content lists.
 *
 * The story, video, FAQ and document lists each carry their own copy of the
 * react-dnd row wiring. It is the same forty lines every time, and the parts
 * that differ — which columns, what a cell shows, what "dimmed" means — are
 * exactly the parts this takes as props. The subtle bits stay in one place:
 * persisting once on drop rather than on every hover tick, and wrapping the
 * connector refs so their return value does not trip React 19's ref typing.
 */

export interface SortableColumn<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function SortableTable<T>({
  rows,
  getId,
  columns,
  onMove,
  onCommit,
  isDimmed,
  dragType,
}: {
  rows: T[];
  getId: (row: T) => string;
  columns: SortableColumn<T>[];
  /** Reorder in local state; called for every row the pointer crosses. */
  onMove: (from: number, to: number) => void;
  /** Persist the current order; called once when the drag ends. */
  onCommit: () => void;
  isDimmed?: (row: T) => boolean;
  /** Distinct per table so two on one page cannot accept each other's rows. */
  dragType: string;
}) {
  return (
    <DndProvider backend={HTML5Backend}>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              {columns.map((c, i) => (
                <TableHead key={i} className={c.className}>{c.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <SortableRow
                key={getId(row)}
                index={index}
                dragType={dragType}
                dimmed={isDimmed?.(row) ?? false}
                onMove={onMove}
                onCommit={onCommit}
              >
                {columns.map((c, i) => (
                  <TableCell key={i} className={c.className}>{c.cell(row)}</TableCell>
                ))}
              </SortableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </DndProvider>
  );
}

function SortableRow({
  index, dragType, dimmed, onMove, onCommit, children,
}: {
  index: number;
  dragType: string;
  dimmed: boolean;
  onMove: (from: number, to: number) => void;
  onCommit: () => void;
  children: ReactNode;
}) {
  const [{ isDragging }, drag, preview] = useDrag({
    type: dragType,
    item: { index },
    /* Persist once on drop. `hover` fires for every row the pointer crosses, so
       saving there sends one transaction per tick and the responses can land
       out of order. */
    end: () => onCommit(),
    collect: (m) => ({ isDragging: m.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: dragType,
    hover: (item: { index: number }) => {
      if (item.index === index) return;
      onMove(item.index, index);
      item.index = index;
    },
  });

  /* react-dnd's connectors return the node they were given, while React 19's
     `Ref` callback type must return void or a cleanup function; wrapping
     discards the return value. */
  const rowRef = (node: HTMLTableRowElement | null) => {
    preview(drop(node));
  };
  const handleRef = (node: HTMLTableCellElement | null) => {
    drag(node);
  };

  return (
    <TableRow
      ref={rowRef}
      className={`${isDragging ? 'opacity-50' : ''} ${dimmed ? 'bg-muted/30' : ''} hover:bg-muted/50 transition-colors`}
    >
      <TableCell className="w-12 p-2 cursor-grab active:cursor-grabbing" ref={handleRef}>
        <GripVertical className="w-5 h-5 text-muted-foreground mx-auto" />
      </TableCell>
      {children}
    </TableRow>
  );
}

/**
 * The local-state half of reordering, shared by every list: splice on move,
 * post `{ id, order }` pairs on commit, reload on failure.
 */
export function useReorder<T extends { id: string }>(
  rows: T[],
  setRows: (fn: (prev: T[]) => T[]) => void,
  persist: (payload: { id: string; order: number }[]) => Promise<void>,
  onError: (e: unknown) => void,
) {
  const latest = useRef(rows);
  latest.current = rows;
  const dirty = useRef(false);

  const onMove = useCallback((from: number, to: number) => {
    dirty.current = true;
    setRows((prev) => {
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
  }, [setRows]);

  const onCommit = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    try {
      await persist(latest.current.map((r, i) => ({ id: r.id, order: i })));
    } catch (e) {
      onError(e);
    }
  }, [persist, onError]);

  return { onMove, onCommit };
}
