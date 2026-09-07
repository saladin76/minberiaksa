"use client";

import * as React from "react";
import { Reader } from "@usewaypoint/email-builder";
import type { EmailDocument } from "./types";
import { defaultDocument } from "./types";
import { BlockList } from "./BlockList";
import { BlockInspector } from "./BlockInspector";
import { APP_FONT_STACK, APP_FONT_GOOGLE_LINK } from "@/lib/templates/font";

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

  return (
    <div
      className="grid gap-4 h-full min-h-[60vh]"
      style={{ gridTemplateColumns: "260px minmax(0, 1fr) 300px" }}
      dir="rtl"
    >
      <link rel="stylesheet" href={APP_FONT_GOOGLE_LINK} />
      <style dangerouslySetInnerHTML={{ __html: PREVIEW_FONT_STYLE }} />

      <aside className="rounded-lg border border-border bg-card p-3 overflow-y-auto">
        <BlockList
          doc={doc}
          selectedId={selectedId}
          onChange={onChange}
          onSelect={setSelectedId}
        />
      </aside>

      <main className="rounded-lg border border-border bg-slate-100 overflow-y-auto p-4" dir="ltr">
        <div className="email-builder-preview mx-auto max-w-[600px] bg-white rounded shadow-sm overflow-hidden">
          <Reader document={doc} rootBlockId="root" />
        </div>
      </main>

      <aside className="rounded-lg border border-border bg-card p-3 overflow-y-auto">
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
