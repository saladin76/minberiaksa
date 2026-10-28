"use client";
import { dashDir } from "@/lib/dashboard/i18n";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
export function EditorModal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        dir={dashDir()}
        hideCloseButton
        className={`max-h-[94vh] w-[95vw] ${wide ? "max-w-[1400px]" : "max-w-5xl"} overflow-auto p-0`}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
