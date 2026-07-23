"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { mobileNavigationGroups } from "@/config/navigation";
import type { NavigationItem } from "@/config/navigation";
import { useBasket } from "@/components/basket/use-basket";
import { CurrencySelector } from "@/components/ui/currency-selector";
import { LanguageSelector } from "@/components/ui/language-selector";
import { BrandMark } from "@/components/ui/brand-mark";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";

const focusable = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function targetPath(href: string) {
  return href.split("#")[0].split("?")[0] || "/";
}

export function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { closeDrawer } = useBasket();
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const closeNavigation = () => setOpen(false);
    window.addEventListener("minber:close-navigation", closeNavigation);
    return () => window.removeEventListener("minber:close-navigation", closeNavigation);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("mobile-navigation-open", open);
    window.dispatchEvent(new CustomEvent("minber:navigation-state", { detail: { open } }));
    return () => document.body.classList.remove("mobile-navigation-open");
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

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
  const openMenu = () => {
    closeDrawer();
    setOpen(true);
  };
  const isActive = (item: NavigationItem) => {
    if (/^(mailto:|https?:)/.test(item.href)) return false;
    const path = targetPath(item.href);
    if (item.href.includes("#")) return false;
    return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <>
      <IconButton
        ref={triggerRef}
        aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => open ? closeMenu() : openMenu()}
      >
        <MenuIcon />
      </IconButton>

      {open ? (
        <div className="mobile-nav-layer">
          <button type="button" className="mobile-nav-backdrop" aria-label="إغلاق القائمة" onClick={closeMenu} />
          <aside ref={panelRef} id={panelId} className="mobile-nav-panel" role="dialog" aria-modal="true" aria-label="القائمة الرئيسية">
            <div className="mobile-nav-header">
              <div className="mobile-nav-brand">
                <BrandMark compact />
                <div><span>مؤسسة دولية</span><strong>منبر الأقصى</strong></div>
              </div>
              <IconButton aria-label="إغلاق القائمة" onClick={closeMenu}><CloseIcon /></IconButton>
            </div>

            <div className="mobile-nav-content">
              {mobileNavigationGroups.map((group) => (
                <section className="mobile-nav-group" aria-labelledby={`mobile-group-${group.title}`} key={group.title}>
                  <h2 id={`mobile-group-${group.title}`}>{group.title}</h2>
                  <nav className="mobile-primary-nav" aria-label={group.title}>
                    {group.links.map((item) => {
                      const active = isActive(item);
                      return (
                        <a
                          className={active ? "is-active" : undefined}
                          aria-current={active ? "page" : undefined}
                          key={`${group.title}-${item.label}`}
                          href={item.href}
                          onClick={closeMenu}
                        >
                          <span>{item.label}</span>
                          <ArrowLeft size={16} aria-hidden="true" />
                        </a>
                      );
                    })}
                  </nav>
                </section>
              ))}

              <section className="mobile-nav-settings" aria-labelledby="mobile-settings-title">
                <h2 id="mobile-settings-title">الإعدادات</h2>
                <div className="mobile-nav-setting-row"><span>اللغة</span><LanguageSelector /></div>
                <div className="mobile-nav-setting-row"><span>العملة</span><CurrencySelector /></div>
                <a className="mobile-nav-account-row" href="/account" onClick={closeMenu}>
                  <span>حساب المتبرع</span><ArrowLeft size={16} aria-hidden="true" />
                </a>
              </section>
            </div>

            <div className="mobile-nav-donate">
              <Button href="/#donate" fullWidth onClick={closeMenu}>تبرع الآن</Button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
