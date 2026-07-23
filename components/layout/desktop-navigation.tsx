"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { NavigationItem } from "@/config/navigation";

function splitHref(href: string) {
  const [pathWithQuery, hashValue] = href.split("#");
  const [path] = pathWithQuery.split("?");
  return { path: path || "/", hash: hashValue ? `#${hashValue}` : "" };
}

export function DesktopNavigation({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash);
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const isActive = (item: NavigationItem) => {
    if (/^(mailto:|https?:)/.test(item.href)) return false;
    const target = splitHref(item.href);
    if (target.hash) return pathname === target.path && hash === target.hash;
    if (target.path === "/") return pathname === "/";
    return pathname === target.path || pathname.startsWith(`${target.path}/`);
  };

  return (
    <nav className="desktop-navigation" aria-label="التنقل الرئيسي">
      {items.map((item) => {
        const active = isActive(item);
        return (
          <a
            className={active ? "is-active" : undefined}
            aria-current={active ? "page" : undefined}
            key={item.label}
            href={item.href}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
