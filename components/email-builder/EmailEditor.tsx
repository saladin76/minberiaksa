"use client";

import * as React from "react";
import { Reader } from "@usewaypoint/email-builder";
import type { EmailDocument } from "./types";
import { defaultDocument } from "./types";
import { BlockList } from "./BlockList";
import { BlockInspector } from "./BlockInspector";
import { APP_FONT_STACK, APP_FONT_GOOGLE_LINK } from "@/lib/templates/font";
import { dashDir } from "@/lib/dashboard/i18n";

export interface EmailEditorProps {
  value: EmailDocument | null | undefined;
  onChange: (next: EmailDocument) => void;
}

/**
 * CSS scope for the live preview. Email-builder writes inline `font-family`
 * styles based on the MODERN_SANS preset (Helvetica Neue stack); we override
 * those with the app font via an attribute selector + !important so admins
 * see exactly what donors will receive.
 */
const PREVIEW_FONT_STYLE = `
.email-builder-preview [style*="Helvetica Neue"] { font-family: ${APP_FONT_STACK} !important; }
.email-builder-preview { font-family: ${APP_FONT_STACK}; }
`;

export function EmailEditor({ value, onChange }: EmailEditorProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>("root");

  const doc = React.useMemo<EmailDocument>(() => value ?? defaultDocument(), [value]);

  /* Fills exactly the height the dialog gives it (no min-height: a 60vh floor
     overflowed the dialog body and clipped the bottom of both panels), and each
     panel scrolls on its own so every control stays reachable. Below `lg` the
     three panels stack and the whole editor scrolls instead. */
  return (
    <div
      className="grid h-full min-h-0 grid-cols-1 gap-2.5 overflow-y-auto lg:grid-cols-[220px_minmax(0,1fr)_270px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden"
      dir={dashDir()}
    >
      <link rel="stylesheet" href={APP_FONT_GOOGLE_LINK} />
      <style dangerouslySetInnerHTML={{ __html: PREVIEW_FONT_STYLE }} />

      <aside className="min-h-0 rounded-lg border border-border bg-card p-2.5 lg:overflow-y-auto">
        <BlockList
          doc={doc}
          selectedId={selectedId}
          onChange={onChange}
          onSelect={setSelectedId}
        />
      </aside>

      <main className="min-h-[320px] rounded-lg border border-border bg-slate-100 p-3 lg:min-h-0 lg:overflow-y-auto" dir="ltr">
        <div className="email-builder-preview mx-auto max-w-[600px] bg-white rounded shadow-sm overflow-hidden">
          <Reader document={doc} rootBlockId="root" />
        </div>
      </main>

      <aside className="min-h-0 rounded-lg border border-border bg-card p-2.5 lg:overflow-y-auto">
        <BlockInspector
          doc={doc}
          selectedId={selectedId}
          onChange={onChange}
          onSelect={setSelectedId}
        />
      </aside>
    </div>
  );
}
