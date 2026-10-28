"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

function isInbox(path: string): boolean {
  return path === "/dashboard/communication/inbox" || path.startsWith("/dashboard/communication/inbox/");
}

/** Permissions-Policy belongs to the document, not to an App Router response. */
export function InboxPermissionsBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [documentInbox] = useState(() => {
    if (typeof window === "undefined") return null;
    // Also works if this layout first mounts after a client navigation from sign-in.
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return isInbox(new URL(navigation?.name || window.location.href).pathname);
  });
  const needsDocument = documentInbox !== null && documentInbox !== isInbox(pathname);

  useEffect(() => {
    if (documentInbox === null) return;
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || isInbox(destination.pathname) === documentInbox) return;
      event.preventDefault();
      window.location.assign(destination.href);
    };
    window.addEventListener("click", navigate, true);
    return () => window.removeEventListener("click", navigate, true);
  }, [documentInbox]);

  useEffect(() => {
    // Covers command palette/router.push and history transitions as well as links.
    if (needsDocument) window.location.reload();
  }, [needsDocument, pathname]);

  return needsDocument ? null : children;
}
