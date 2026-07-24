"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { CompactFooter } from "@/components/layout/compact-footer";
import { siteConfig } from "@/config/site";

const accountLinks = [
  { href: "/account", label: "نظرة عامة" },
  { href: "/account/donations", label: "تبرعاتي" },
  { href: "/account/recurring", label: "التبرعات الدورية" },
  { href: "/account/documents", label: "الوثائق" },
  { href: "/account/impact", label: "التقارير والتحديثات" },
  { href: "/account/settings", label: "بيانات الحساب" },
] as const;

const focusable = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen || !panelRef.current) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const list = () => Array.from(panel.querySelectorAll<HTMLElement>(focusable));
    window.requestAnimationFrame(() => list()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); return; }
      if (event.key !== "Tab") return;
      const items = list();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
  }, [menuOpen]);

  const navigation = (
    <nav className="account-navigation" aria-label="التنقل داخل حساب المتبرع">
      {accountLinks.map((item) => {
        const active = item.href === "/account" ? pathname === item.href : pathname.startsWith(item.href);
        return <a key={item.href} href={item.href} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)}>{item.label}</a>;
      })}
    </nav>
  );

  return (
    <div className="account-shell">
      <div className="account-demo-banner" role="status" aria-label="حالة الحساب">
        <strong>الحساب غير متصل</strong>
        <span>لن تظهر بيانات شخصية أو تبرعات قبل تسجيل الدخول.</span>
      </div>

      <header className="account-header">
        <a className="account-brand" href="/" aria-label={`العودة إلى ${siteConfig.nameAr}`}>
          <BrandMark compact />
          <span><strong>{siteConfig.nameAr}</strong><small>حساب المتبرع</small></span>
        </a>
        <div className="account-header-user"><span>حالة الحساب</span><strong>غير متصل</strong></div>
        <div className="account-header-actions">
          <a href="/">العودة إلى الموقع</a>
          <Button href="/projects" size="small" variant="outline">استكشف المشاريع</Button>
          <a href="/account/sign-in">تسجيل الدخول</a>
        </div>
        <button ref={triggerRef} type="button" className="account-mobile-menu-trigger" aria-expanded={menuOpen} aria-controls={panelId} onClick={() => setMenuOpen(true)}>قائمة الحساب</button>
      </header>

      <div className="account-layout">
        <aside className="account-sidebar">
          <div><span>حساب المتبرع</span><strong>غير متصل</strong></div>
          {navigation}
          <a href="/account/sign-in">تسجيل الدخول</a>
        </aside>
        <main id="main-content" className="account-main">{children}</main>
      </div>

      <CompactFooter selectors={false} />

      {menuOpen ? (
        <div className="account-mobile-layer">
          <button className="account-mobile-backdrop" type="button" aria-label="إغلاق قائمة الحساب" onClick={() => setMenuOpen(false)} />
          <aside ref={panelRef} id={panelId} className="account-mobile-panel" role="dialog" aria-modal="true" aria-labelledby={`${panelId}-title`}>
            <header>
              <div><span>حساب المتبرع</span><h2 id={`${panelId}-title`}>قائمة الحساب</h2></div>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="إغلاق">×</button>
            </header>
            {navigation}
            <a href="/projects">استكشف المشاريع</a>
            <a href="/account/sign-in">تسجيل الدخول</a>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
