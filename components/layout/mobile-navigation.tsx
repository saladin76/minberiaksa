"use client";

import { useEffect, useId, useRef, useState } from "react";
import { primaryNavigation, utilityNavigation } from "@/config/navigation";
import { CurrencySelector } from "@/components/ui/currency-selector";
import { LanguageSelector } from "@/components/ui/language-selector";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";

const focusable = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = panelRef.current;
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(focusable));
    requestAnimationFrame(() => items()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
  }, [open]);

  const closeMenu = () => setOpen(false);
  const donationLinks = primaryNavigation.slice(0, 4);
  const institutionalLinks = primaryNavigation.slice(4);

  return (
    <>
      <IconButton ref={triggerRef} aria-label={open ? "إغلاق القائمة" : "فتح القائمة"} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        <MenuIcon />
      </IconButton>
      {open ? (
        <div className="mobile-nav-layer">
          <button type="button" className="mobile-nav-backdrop" aria-label="إغلاق القائمة" onClick={closeMenu} />
          <aside ref={panelRef} id={panelId} className="mobile-nav-panel" role="dialog" aria-modal="true" aria-label="القائمة الرئيسية">
            <div className="mobile-nav-header">
              <div><span>منصة العطاء</span><strong>منبر الأقصى</strong></div>
              <IconButton aria-label="إغلاق القائمة" onClick={closeMenu}><CloseIcon /></IconButton>
            </div>

            <div className="mobile-nav-group">
              <span>مسارات العطاء</span>
              <nav className="mobile-primary-nav" aria-label="مسارات العطاء">
                {donationLinks.map((item) => <a key={item.label} href={item.href} onClick={closeMenu}>{item.label}</a>)}
              </nav>
            </div>

            <div className="mobile-nav-group">
              <span>الثقة والمؤسسة</span>
              <nav className="mobile-primary-nav" aria-label="الثقة والمؤسسة">
                {institutionalLinks.map((item) => <a key={item.label} href={item.href} onClick={closeMenu}>{item.label}</a>)}
                <a href="/account" onClick={closeMenu}>حساب المتبرع</a>
              </nav>
            </div>

            <nav className="mobile-utility-nav" aria-label="المشاركة مع المؤسسة">
              {utilityNavigation.map((item) => <a key={item.label} href={item.href} onClick={closeMenu}>{item.label}</a>)}
            </nav>

            <div className="mobile-selector-grid"><LanguageSelector /><CurrencySelector /></div>
            <div className="mobile-nav-donate"><Button href="/#donate" fullWidth onClick={closeMenu}>تبرع الآن</Button></div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
