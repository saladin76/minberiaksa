"use client";

import { useEffect, useId, useRef, useState } from "react";
import { primaryNavigation, utilityNavigation } from "@/config/navigation";
import { CurrencySelector } from "@/components/ui/currency-selector";
import { LanguageSelector } from "@/components/ui/language-selector";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";

export function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <IconButton ref={triggerRef} aria-label={open ? "إغلاق القائمة" : "فتح القائمة"} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        <MenuIcon />
      </IconButton>
      {open ? (
        <div className="mobile-nav-layer">
          <button type="button" className="mobile-nav-backdrop" aria-label="إغلاق القائمة" onClick={closeMenu} />
          <aside id={panelId} className="mobile-nav-panel" aria-label="القائمة الرئيسية">
            <div className="mobile-nav-header">
              <div><span>القائمة</span><strong>منبر الأقصى</strong></div>
              <IconButton ref={closeRef} aria-label="إغلاق القائمة" onClick={closeMenu}><CloseIcon /></IconButton>
            </div>
            <nav className="mobile-primary-nav" aria-label="التنقل الرئيسي للموبايل">
              {primaryNavigation.map((item) => <a key={item.label} href={item.href} onClick={closeMenu}>{item.label}</a>)}
            </nav>
            <nav className="mobile-utility-nav" aria-label="روابط المشاركة">
              {utilityNavigation.slice(0, 2).map((item) => <a key={item.label} href={item.href} onClick={closeMenu}>{item.label}</a>)}
            </nav>
            <div className="mobile-selector-grid"><LanguageSelector /><CurrencySelector /></div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
