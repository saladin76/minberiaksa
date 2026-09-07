"use client";

import React from "react";
import WysiwygEditor from "../../_components/wysiwyg/wysiwyg-editor";
import { defaultEditorContent } from "../../_components/wysiwyg/default-content";

interface BlogPostContentProps {
  content: string | null | undefined;
}

export default function BlogPostContent({ content }: BlogPostContentProps) {
  if (!content || !content.trim()) {
    return null;
  }

  let parsed: object | null = null;
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) {
    try {
      parsed = JSON.parse(trimmed) as object;
    } catch {
      // not valid JSON, render as plain text below
    }
  }

  if (parsed && typeof parsed === "object" && "type" in parsed && (parsed as { type?: string }).type === "doc") {
    return (
      <div className="prose max-w-none [&_.ProseMirror]:min-h-0 [&_.ProseMirror]:p-0 [&_.ProseMirror]:focus:outline-none">
        <WysiwygEditor
          defaultValue={parsed}
          isEditable={false}
          className="border-0 shadow-none p-0 min-h-0"
        />
      </div>
    );
  }

  return (
    <div
      className="prose max-w-none"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
