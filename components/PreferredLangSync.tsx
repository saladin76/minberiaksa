"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { isValidLocale } from "@/lib/locales";

/**
 * Backfills `preferredLang` once for logged-in users who don't have it set yet
 * (e.g. accounts created before this column was wired up). Sends `ifMissing:true`
 * so the server only writes when the field is currently null — explicit choices
 * via the LanguageSelector are never overwritten.
 *
 * Mounted inside SessionProvider in the public locale layout. No-op for guests.
 */
export default function PreferredLangSync() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const sentRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;
    if (sentRef.current) return;

    const localeSegment = pathname.split("/").filter(Boolean)[0] ?? "";
    if (!isValidLocale(localeSegment)) return;

    sentRef.current = true;
    fetch("/api/users/me/preferred-lang", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: localeSegment, ifMissing: true }),
      keepalive: true,
    }).catch(() => {});
  }, [status, session?.user?.id, pathname]);

  return null;
}
