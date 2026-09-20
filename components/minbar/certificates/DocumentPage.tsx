"use client";

import type { ReactNode } from "react";

/**
 * The standalone page around one document — the sheet, the print rules from
 * its handoff file, and the `.no-print` action row beneath it (save as PDF,
 * print, back). The buttons never appear in print or in the PDF.
 *
 * The site shell (header, footer, quick-donation dock) is hidden in print so
 * the page prints the sheet alone, as the handoff files do when opened on
 * their own.
 */

export interface DocumentAction {
  label: string;
  href?: string;
  /** `print` calls `window.print()`; the default follows `href`. */
  kind?: "print" | "link";
  primary?: boolean;
  /** Hint to the browser to download rather than open. */
  download?: boolean;
}

export interface DocumentPageProps {
  /** Extra `@media print` CSS: the `@page` size and the sheet's print size. */
  printCss: string;
  actions: DocumentAction[];
  /** Optional note above the actions (e.g. a preview warning). */
  note?: string;
  children: ReactNode;
}

const PrintIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8z" />
  </svg>
);

const DownloadIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
  </svg>
);

const SHELL_PRINT_CSS = `
@media print {
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; height: auto !important; }
  .mia-scope .mia-head, .mia-scope .mia-head-spacer, .mia-scope .mia-foot, .mia-scope .no-print,
  .mia-scope [data-quick-donate], .mia-scope .mia-quick-dock, .mia-scope .mia-cart-reminder { display: none !important; }
  .mia-scope main { padding: 0 !important; }
  .mia-doc-wrap { padding: 0 !important; min-height: 0 !important; background: #fff !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}`;

export default function DocumentPage({ printCss, actions, note, children }: DocumentPageProps) {
  return (
    <div className="mia-doc-wrap" style={{ minHeight: "60vh", padding: "28px 20px 44px", background: "var(--sand, #F7F2EA)" }}>
      <style dangerouslySetInnerHTML={{ __html: SHELL_PRINT_CSS + printCss }} />
      {children}

      {note ? (
        <p className="no-print" style={{ margin: "18px auto 0", maxWidth: 720, textAlign: "center", fontSize: 13, color: "var(--muted, #52616B)" }}>{note}</p>
      ) : null}

      <div className="no-print" style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", paddingTop: 26 }}>
        {actions.map((action) => {
          const style = action.primary
            ? { display: "inline-flex", alignItems: "center", gap: 9, height: 48, padding: "0 26px", border: 0, borderRadius: 8, background: "var(--gold, #D39A27)", color: "var(--deep, #10212B)", fontFamily: "inherit", fontSize: 14, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" as const, textDecoration: "none" }
            : { display: "inline-flex", alignItems: "center", gap: 9, height: 48, padding: "0 24px", borderRadius: 8, border: "1px solid rgba(16,33,43,.16)", background: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 800, color: "var(--deep, #10212B)", cursor: "pointer", whiteSpace: "nowrap" as const, textDecoration: "none" };
          if (action.kind === "print") {
            return (
              <button key={action.label} type="button" onClick={() => window.print()} style={style}>
                {PrintIcon}
                {action.label}
              </button>
            );
          }
          return (
            <a key={action.label} href={action.href} download={action.download ? "" : undefined} style={style}>
              {action.download ? DownloadIcon : null}
              {action.label}
            </a>
          );
        })}
      </div>
    </div>
  );
}
