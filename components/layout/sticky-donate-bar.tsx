"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useBasket } from "@/components/basket/use-basket";
import { Button } from "@/components/ui/button";

export function StickyDonateBar() {
  const pathname = usePathname();
  const { drawerOpen } = useBasket();
  const [pastHero, setPastHero] = useState(false);
  const [donationVisible, setDonationVisible] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const [fieldFocused, setFieldFocused] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => {
    const updateScroll = () => setPastHero(window.scrollY > Math.min(520, window.innerHeight * 0.58));
    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("resize", updateScroll);
    return () => {
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("resize", updateScroll);
    };
  }, []);

  useEffect(() => {
    const donation = document.querySelector("#donate");
    const footer = document.querySelector("footer");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === donation) setDonationVisible(entry.isIntersecting);
        if (entry.target === footer) setFooterVisible(entry.isIntersecting);
      });
    }, { threshold: 0.05 });
    if (donation) observer.observe(donation);
    if (footer) observer.observe(footer);
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      setFieldFocused(target instanceof HTMLElement && Boolean(target.closest("input, select, textarea, [contenteditable='true']")));
    };
    const onFocusOut = () => window.requestAnimationFrame(() => {
      const target = document.activeElement;
      setFieldFocused(target instanceof HTMLElement && Boolean(target.closest("input, select, textarea, [contenteditable='true']")));
    });
    const onNavigationState = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      setNavigationOpen(Boolean(detail?.open));
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("minber:navigation-state", onNavigationState);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("minber:navigation-state", onNavigationState);
    };
  }, []);

  if (pathname !== "/") return null;

  const visible = pastHero && !donationVisible && !footerVisible && !fieldFocused && !drawerOpen && !navigationOpen;

  return (
    <aside className={`sticky-donate-bar${visible ? " is-visible" : ""}`} aria-label="تبرع سريع" aria-hidden={!visible}>
      <Button href="#donate" size="large" fullWidth>تبرع الآن</Button>
    </aside>
  );
}
