"use client";

import { useEffect } from "react";

/** Lets shell controls check for a draft before they mutate cookies or reload. */
export const CHECK_DASHBOARD_DRAFT = "dashboard:check-unsaved-draft";

export function useDashboardUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: Event) => event.preventDefault();
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener(CHECK_DASHBOARD_DRAFT, protect);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener(CHECK_DASHBOARD_DRAFT, protect);
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty]);
}
