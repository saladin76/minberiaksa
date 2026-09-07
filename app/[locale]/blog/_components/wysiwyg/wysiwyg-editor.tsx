"use client";

import "@/styles/prosemirror.css";
import "@/styles/editor.css";
import { Editor as EditorClass } from "@tiptap/core";
import { EditorProps } from "@tiptap/pm/view";
import {
  EditorContent,
  Extension,
  JSONContent,
  useEditor,
} from "@tiptap/react";
import { useEffect, useRef } from "react";
import { useDebouncedCallback } from "use-debounce";
import { EditorBubbleMenu } from "./bubble-menu";
import { defaultEditorContent } from "./default-content";
import { defaultExtensions } from "./extensions";
import { ImageResizer } from "./extensions/image-resizer";
import { defaultEditorProps } from "./props";
import { EditorToolbar } from "./toolbar";

export default function WysiwygEditor({
  isEditable = true,
  className = "relative w-full focus:ring-sky-600 focus:outline-8 max-w-screen-lg border-stone-200 bg-white sm:mb-[calc(20vh)] sm:rounded-lg sm:border sm:shadow-lg",
  defaultValue = defaultEditorContent,
  onDebouncedUpdate = () => {},
  debounceDuration = 750,
  onUpdate = () => {},
  extensions = [],
  editorProps = {},
}: {
  isEditable?: boolean;
  className?: string;
  defaultValue?: JSONContent | string;
  extensions?: Extension[];
  editorProps?: EditorProps;
  onUpdate?: (editor?: EditorClass) => void | Promise<void>;
  onDebouncedUpdate?: (editor?: EditorClass) => void | Promise<void>;
  debounceDuration?: number;
}) {
  const debouncedUpdates = useDebouncedCallback(async ({ editor }) => {
    onDebouncedUpdate(editor);
  }, debounceDuration);

  const editor = useEditor({
    editable: isEditable,
    extensions: [...defaultExtensions, ...extensions],
    editorProps: {
      ...defaultEditorProps,
      ...editorProps,
    },
    onUpdate: (e) => {
      onUpdate(e.editor);
      debouncedUpdates(e);
    },
  });

  // Track what we last applied to the editor so we don't stomp on the user's
  // cursor every render. The parent re-creates the `defaultValue` object on
  // every keystroke (parseEditorContent(state)), so a naïve `setContent` would
  // reset selection to the end after every edit.
  const hydratedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editor) return;

    // Serialize incoming value for a stable equality check against what we last
    // applied, and against the editor's current content.
    const incomingKey =
      typeof defaultValue === "string"
        ? defaultValue
        : JSON.stringify(defaultValue);

    if (hydratedKeyRef.current === incomingKey) return;

    // If the editor already holds the same content (e.g. because the parent is
    // re-feeding us the JSON it just received from onUpdate), skip to avoid
    // resetting the selection.
    const currentKey = JSON.stringify(editor.getJSON());
    if (currentKey === incomingKey) {
      hydratedKeyRef.current = incomingKey;
      return;
    }

    // Preserve the current selection across a genuine external content swap
    // when possible — but never force cursor movement just because the parent
    // re-rendered.
    const wasFocused = editor.isFocused;
    editor.commands.setContent(defaultValue, false);
    hydratedKeyRef.current = incomingKey;
    if (wasFocused) {
      // Keep focus but don't snap the cursor anywhere specific.
      editor.commands.focus(undefined, { scrollIntoView: false });
    }
  }, [editor, defaultValue]);

  return (
    <div className={isEditable ? className : ""}>
      {isEditable && editor && <EditorToolbar editor={editor} />}
      {editor && <EditorBubbleMenu editor={editor} />}
      {editor?.isActive("image") && <ImageResizer editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
