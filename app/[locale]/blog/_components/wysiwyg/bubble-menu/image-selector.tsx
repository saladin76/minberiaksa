"use client";

import { getUrlFromString } from "@/lib/utils";
import { dt } from "@/lib/dashboard/i18n";
import { Editor } from "@tiptap/core";
import { Check, ImageIcon } from "lucide-react";
import { Dispatch, FC, SetStateAction, useEffect, useRef } from "react";

interface ImageSelectorProps {
  editor: Editor;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}

export const ImageSelector: FC<ImageSelectorProps> = ({
  editor,
  isOpen,
  setIsOpen,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus on input by default
  useEffect(() => {
    inputRef.current?.focus();
  }, [isOpen]);

  const handleLinkSubmission = () => {
    const url = getUrlFromString(inputRef.current?.value || "");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-full items-center space-x-2 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 active:bg-stone-200"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        <p className="text-base">
          <ImageIcon className="h4 w-4" />
        </p>
        <p className="text-gray-900 underline decoration-stone-400 underline-offset-4">
          {dt("صورة")}
        </p>
      </button>
      {isOpen && (
        <div className="fixed top-full z-[99999] mt-1 flex w-60 overflow-hidden rounded border border-stone-200 bg-white p-1 shadow-xl animate-in fade-in slide-in-from-top-1">
          <input
            ref={inputRef}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); handleLinkSubmission(); } }}
            type="text"
            placeholder={dt("رابط الصورة")} aria-label={dt("رابط الصورة")} dir="ltr"
            className="flex-1 bg-white p-1 text-sm outline-none"
            defaultValue=""
          />
          <button
            onClick={handleLinkSubmission}
            type="button"
            className="flex items-center rounded-sm p-1 text-stone-600 transition-all hover:bg-stone-100"
          >
            <span className="sr-only">{dt("تطبيق")}</span><Check className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};
