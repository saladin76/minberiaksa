"use client";

import { ReactNode, useCallback, useState } from "react";

import { DonationActionsMenu } from "./DonationActionsMenu";
import { EditDonationDialog } from "./EditDonationDialog";
import { DeleteDonationDialog, type DeleteDonationRow } from "./DeleteDonationDialog";
import { CreateDonationDialog } from "./CreateDonationDialog";

/**
 * Minimum row shape needed for the right-click menu + delete confirmation.
 * All three donation tables (dashboard, referrals, monthly) project their
 * rows to this shape — anything more is fetched fresh by the edit dialog.
 */
export interface DonationActionRow extends DeleteDonationRow {
  status: string;
}

interface Options {
  /** Gate the right-click. When false, the browser's native menu is used. */
  enabled: boolean;
  /** Refresh callback after a successful edit/delete (re-fetch the table). */
  onChange: () => void;
}

interface MenuState {
  row: DonationActionRow;
  x: number;
  y: number;
}

/**
 * Bundled state + portals for the donation actions UX: right-click edit/delete
 * on a row, plus an `openCreate` trigger for the "manual add donation" dialog.
 * Each donation table wires `onContextMenu` on its <tr>, renders `portals`
 * once, and (optionally) calls `openCreate` from a header button.
 */
export function useDonationActions({ enabled, onChange }: Options): {
  onContextMenu: (e: React.MouseEvent, row: DonationActionRow) => void;
  openCreate: () => void;
  portals: ReactNode;
} {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DonationActionRow | null>(null);
  const [creating, setCreating] = useState(false);

  const onContextMenu = useCallback(
    (e: React.MouseEvent, row: DonationActionRow) => {
      if (!enabled) return;
      e.preventDefault();
      setMenu({ row, x: e.clientX, y: e.clientY });
    },
    [enabled]
  );

  const openCreate = useCallback(() => {
    if (!enabled) return;
    setCreating(true);
  }, [enabled]);

  const portals = (
    <>
      {menu && (
        <DonationActionsMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onEdit={() => setEditingId(menu.row.id)}
          onDelete={() => setDeleting(menu.row)}
        />
      )}
      {editingId && (
        <EditDonationDialog
          donationId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={onChange}
        />
      )}
      {deleting && (
        <DeleteDonationDialog
          row={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={onChange}
        />
      )}
      {creating && (
        <CreateDonationDialog onClose={() => setCreating(false)} onCreated={onChange} />
      )}
    </>
  );

  return { onContextMenu, openCreate, portals };
}
