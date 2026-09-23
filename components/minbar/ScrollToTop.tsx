"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Sends every in-app navigation back to the top of the page.
 *
 * Next's own scroll reset is unreliable here: `app/[locale]/globals.css`
 * declares `scroll-behavior: smooth` on the universal selector, so the
 * temporary `scroll-behavior: auto` Next sets on `<html>` does not cover the
 * other elements it walks, and a reader who tapped an article card down by the
 * footer landed on the new page still scrolled to the footer.
 *
 * Doing it on `pathname` rather than on the click keeps it honest for every
 * entry point — cards, the header, the footer, breadcrumbs — and for the back
 * button, which should also land where the reader expects.
 *
 * A same-page anchor (`#urgent`) is left alone: the hash is the whole point of
 * that link, and scrolling to the top would undo it.
 */
export default function ScrollToTop() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.location.hash) return;

    /* `instant` when the reader asked for no motion; smooth otherwise, which is
       the glide the design wants between pages. */
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, left: 0, behavior: reduced ? "instant" : "smooth" });
  }, [pathname]);

  return null;
}
