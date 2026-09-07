"use client";
import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Edit2, Loader2, LucideIcon } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

interface EditDialogProps {
  title: string;
  value: string;
  onSave: (value: string) => Promise<void>;
  type?: string;
  icon?: LucideIcon;
}

const EditDialog = ({ title, value, onSave, type = "text", icon: Icon }: EditDialogProps) => {
  const t = useTranslations("Profile.editDialog");
  const locale = useLocale();
  const isRTL = locale === "ar";

  const [newValue, setNewValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setNewValue(value);
  }, [value]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(newValue);
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
  };

  return (
    <>
      {/* Row trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        dir={isRTL ? "rtl" : "ltr"}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors group"
      >
        {/* Icon */}
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-[#A5243D]/8 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-[#A5243D]" />
          </div>
        )}

        {/* Label + value */}
        <div className="flex-1 min-w-0 text-start">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-none mb-0.5">
            {title}
          </p>
          <p className="text-sm font-medium text-gray-900 truncate">
            {value || (
              <span className="text-gray-400 italic">{t("notSpecified")}</span>
            )}
          </p>
        </div>

        {/* Edit pencil */}
        <Edit2 className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#A5243D] flex-shrink-0 transition-colors" />
      </button>

      {/* Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          dir={isRTL ? "rtl" : "ltr"}
          className="sm:max-w-md rounded-2xl px-0 overflow-hidden"
        >
          {/* Dialog header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              {Icon && (
                <div className="w-9 h-9 rounded-xl bg-[#A5243D]/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4.5 h-4.5 text-[#A5243D]" />
                </div>
              )}
              <DialogTitle className="text-base font-semibold text-gray-900 text-start">
                {t("editTitle", { title })}
              </DialogTitle>
            </div>
          </DialogHeader>

          {/* Dialog body */}
          <div className="px-6 pb-5 space-y-4">
            <Input
              type={type}
              value={newValue || ""}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("enterPlaceholder", { title })}
              dir={isRTL ? "rtl" : "ltr"}
              className="h-11 rounded-lg border-gray-200 focus:border-[#A5243D] focus:ring-[#A5243D]/20 text-start"
              autoFocus
            />

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 h-10 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 h-10 rounded-lg bg-[#A5243D] hover:bg-[#7D1830] text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t("saveChanges")
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EditDialog;
