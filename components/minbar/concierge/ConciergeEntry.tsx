"use client";

import { useTranslations } from "next-intl";
import { openConcierge } from "@/lib/ai/concierge/client";

/**
 * Contextual entry to the concierge — a quiet card under a page's own
 * donation module ("is this project right for me?"). Opens the launcher's
 * panel with the intent pre-selected; nothing here calls the model.
 */
export default function ConciergeEntry({ intent = "current_page", compact = false }: { intent?: "current_page" | "explore"; compact?: boolean }) {
  const t = useTranslations("Concierge");
  return (
    <button type="button" className={`cg-entry${compact ? " cg-entry-compact" : ""}`} onClick={() => openConcierge({ intent })}>
      <span className="cg-entry-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3.5a4.2 4.2 0 1 0 3.2 6.9 3.3 3.3 0 1 1-3.2-6.9Z" />
          <path d="M3 14.5c2.2-1.2 3.6-1.1 5.2.2l2.4 1.9c.9.7.8 1.9-.3 2.2l-2.1.6" />
          <path d="M21 14.5c-2.2-1.2-3.6-1.1-5.2.2l-2.4 1.9c-.9.7-.8 1.9.3 2.2l2.1.6" />
          <path d="M8 21h8" />
        </svg>
      </span>
      <span className="cg-entry-text">
        <b>{intent === "current_page" ? t("a_this_project") : t("title")}</b>
        <span>{t("s_welcome")}</span>
      </span>
    </button>
  );
}
