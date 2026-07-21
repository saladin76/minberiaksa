"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { donorDemo } from "@/data/donor-demo";

const accountLinks = [
  { href: "/account", label: "نظرة عامة" },
  { href: "/account/impact", label: "محفظة الأثر" },
  { href: "/account/donations", label: "التبرعات" },
  { href: "/account/documents", label: "الوثائق" },
  { href: "/account/recurring", label: "العطاء المستمر" },
  { href: "/account/settings", label: "الإعدادات" },
] as const;

const focusable = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const demo = params.get("demo") === "1";
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

  if (!demo) {
    return <main id="main-content" className="account-gate"><section><span>Frontend Prototype</span><h1>هذه تجربة حساب متبرع تجريبية</h1><p>لا يوجد تسجيل دخول أو حساب حقيقي. افتح Demo Mode لمراجعة بنية الحساب ومحفظة الأثر.</p><Button href={`${pathname}?demo=1`}>فتح الحساب التجريبي</Button><Button href="/account/sign-in" variant="outline">العودة إلى صفحة الدخول</Button><small>لا يتم حفظ أي بيانات شخصية أو إنشاء جلسة Authentication.</small></section></main>;
  }

  const navigation = <nav className="account-navigation" aria-label="التنقل داخل حساب العطاء">{accountLinks.map((item) => {
    const active = item.href === "/account" ? pathname === item.href : pathname.startsWith(item.href);
    return <a key={item.href} href={`${item.href}?demo=1`} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)}>{item.label}</a>;
  })}</nav>;

  return <div className="account-shell">
    <div className="account-demo-banner" role="status" aria-label="حساب تجريبي"><strong>DEMO ACCOUNT</strong><span>البيانات المعروضة تجريبية ولا تمثل تبرعات أو متبرعين حقيقيين.</span></div>
    <header className="account-header">
      <a className="account-brand" href="/" aria-label={`العودة إلى ${siteConfig.nameAr}`}><BrandMark compact/><span><strong>{siteConfig.nameAr}</strong><small>مساحة العطاء التجريبية</small></span></a>
      <div className="account-header-user"><span>Demo Account</span><strong>{donorDemo.profile.displayName}</strong></div>
      <div className="account-header-actions"><a href="/">العودة للموقع</a><Button href="/projects" size="small" variant="outline">تبرع من جديد</Button><button type="button" onClick={() => router.push("/account/sign-in?ended=1")}>الخروج من المعاينة</button></div>
      <button ref={triggerRef} type="button" className="account-mobile-menu-trigger" aria-expanded={menuOpen} aria-controls={panelId} onClick={() => setMenuOpen(true)}>قائمة الحساب</button>
    </header>
    <div className="account-layout">
      <aside className="account-sidebar"><div><span>حساب العطاء</span><strong>{donorDemo.profile.displayName}</strong></div>{navigation}<button type="button" onClick={() => router.push("/account/sign-in?ended=1")}>الخروج من المعاينة</button></aside>
      <main id="main-content" className="account-main">{children}</main>
    </div>
    {menuOpen ? <div className="account-mobile-layer"><button className="account-mobile-backdrop" type="button" aria-label="إغلاق قائمة الحساب" onClick={() => setMenuOpen(false)}/><aside ref={panelRef} id={panelId} className="account-mobile-panel" role="dialog" aria-modal="true" aria-labelledby={`${panelId}-title`}><header><div><span>DEMO ACCOUNT</span><h2 id={`${panelId}-title`}>تنقل حساب العطاء</h2></div><button type="button" onClick={() => setMenuOpen(false)} aria-label="إغلاق">×</button></header>{navigation}<a href="/projects">تبرع من جديد</a><button type="button" onClick={() => router.push("/account/sign-in?ended=1")}>الخروج من المعاينة</button></aside></div> : null}
  </div>;
}
