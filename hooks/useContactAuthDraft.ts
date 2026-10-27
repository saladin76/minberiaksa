"use client";
import { useEffect, useRef } from "react";
import { signIn, useSession } from "next-auth/react";

/** Resume the draft after sign-in; sending still requires the submit button. */
export function useContactAuthDraft(restore: (draft: Record<string, unknown>) => void, scope = "contact") {
  const { data: session, status } = useSession();
  const restoreRef = useRef(restore); restoreRef.current = restore;
  useEffect(() => {
    const key = `${scope}-draft:${window.location.pathname}`;
    try {
      const stored = window.sessionStorage.getItem(key);
      if (!stored) return;
      const value = JSON.parse(stored);
      if (value && typeof value === "object" && Date.now() - value.at < 30 * 60 * 1000 && value.draft && typeof value.draft === "object") restoreRef.current(value.draft);
      window.sessionStorage.removeItem(key);
    } catch { /* Storage may be disabled; authentication must still work. */ }
  }, [scope]);
  return (draft: Record<string, unknown>) => {
    if (status === "loading") return false;
    if (session?.user?.id) return true;
    try { window.sessionStorage.setItem(`${scope}-draft:${window.location.pathname}`, JSON.stringify({ at: Date.now(), draft })); } catch {}
    void signIn(undefined, { callbackUrl: window.location.href });
    return false;
  };
}
