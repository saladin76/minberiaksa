"use client";

import { cn } from "@/lib/utils";
import type { Editor } from "@tiptap/core";
import axios from "axios";
import { toast } from "react-hot-toast";
import {
  Bold as BoldIcon,
  Code as CodeIcon,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image as ImageIcon,
  Italic as ItalicIcon,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Palette,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from "react";

const FONT_SIZES = [
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "30px",
  "36px",
  "48px",
  "60px",
  "72px",
];

const TEXT_COLORS = [
  { name: "Default", value: null },
  { name: "Gray", value: "#78716c" },
  { name: "Red", value: "#E00000" },
  { name: "Orange", value: "#FFA500" },
  { name: "Yellow", value: "#EAB308" },
  { name: "Green", value: "#008A00" },
  { name: "Blue", value: "#2563EB" },
  { name: "Purple", value: "#9333EA" },
  { name: "Pink", value: "#BA4081" },
];

const HIGHLIGHT_COLORS = [
  { name: "None", value: null },
  { name: "Yellow", value: "#FEF08A" },
  { name: "Green", value: "#BBF7D0" },
  { name: "Blue", value: "#BFDBFE" },
  { name: "Pink", value: "#FBCFE8" },
  { name: "Purple", value: "#E9D5FF" },
  { name: "Orange", value: "#FED7AA" },
];

type ToolButtonProps = {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: ReactNode;
};

const ToolButton: FC<ToolButtonProps> = ({
  onClick,
  active,
  disabled,
  title,
  children,
}) => (
  <button
    type="button"
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    aria-pressed={!!active}
    className={cn(
      "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-stone-600 transition-colors hover:bg-stone-200/80",
      "disabled:cursor-not-allowed disabled:opacity-40",
      active && "bg-stone-200 text-stone-900"
    )}
  >
    {children}
  </button>
);

const Divider = () => <span className="mx-1 h-6 w-px bg-stone-200" />;

type EditorToolbarProps = {
  editor: Editor | null;
};

export const EditorToolbar: FC<EditorToolbarProps> = ({ editor }) => {
  // Subscribe to editor updates so active-state buttons re-render
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => force((n) => n + 1);
    editor.on("selectionUpdate", onUpdate);
    editor.on("transaction", onUpdate);
    return () => {
      editor.off("selectionUpdate", onUpdate);
      editor.off("transaction", onUpdate);
    };
  }, [editor]);

  const getCurrentFontSize = useCallback(() => {
    if (!editor) return "";
    const attrs = editor.getAttributes("textStyle");
    return typeof attrs.fontSize === "string" ? attrs.fontSize : "";
  }, [editor]);

  const promptForLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Enter URL", previous || "https://");
    if (url === null) return; // cancel
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url, target: "_blank", rel: "noopener noreferrer" })
      .run();
  }, [editor]);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // reset so picking the same file twice still triggers change
      if (e.target) e.target.value = "";
      if (!file || !editor) return;
      if (!file.type.startsWith("image/")) {
        toast.error("الملف ليس صورة");
        return;
      }
      setUploadingImage(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await axios.post("/api/upload", formData);
        const url: string | undefined = response.data?.url;
        if (!url) throw new Error("Upload returned no URL");
        editor.chain().focus().setImage({ src: url }).run();
        toast.success("تم رفع الصورة");
      } catch (err) {
        console.error("Toolbar image upload error:", err);
        toast.error("فشل رفع الصورة");
      } finally {
        setUploadingImage(false);
      }
    },
    [editor],
  );

  if (!editor) return null;

  const fontSize = getCurrentFontSize();

  return (
    <div
      dir="ltr"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-md border-b border-stone-200 bg-stone-50 px-2 py-1.5"
      onMouseDown={(e) => {
        // Keep editor selection intact when clicking on empty toolbar space
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      {/* Headings */}
      <ToolButton
        title="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
      >
        <Heading1 className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        <Heading2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
      >
        <Heading3 className="h-4 w-4" />
      </ToolButton>

      <Divider />

      {/* Font size */}
      <label className="flex items-center">
        <span className="sr-only">Font size</span>
        <select
          value={fontSize}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) editor.chain().focus().unsetFontSize().run();
            else editor.chain().focus().setFontSize(v).run();
          }}
          className="h-8 rounded border border-stone-200 bg-white px-2 text-xs text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-300"
          title="Font size"
          aria-label="Font size"
        >
          <option value="">Size</option>
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <Divider />

      {/* Inline marks */}
      <ToolButton
        title="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Inline code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <CodeIcon className="h-4 w-4" />
      </ToolButton>

      <Divider />

      {/* Text color */}
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-1 top-1">
          <Palette className="h-4 w-4 text-stone-600" />
        </span>
        <input
          type="color"
          title="Text color"
          aria-label="Text color"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) =>
            editor.chain().focus().setColor(e.target.value).run()
          }
          className="h-8 w-8 cursor-pointer rounded border border-stone-200 bg-white opacity-0"
        />
      </div>
      <select
        aria-label="Text color preset"
        title="Text color preset"
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) editor.chain().focus().unsetColor().run();
          else editor.chain().focus().setColor(v).run();
          e.target.selectedIndex = 0;
        }}
        className="h-8 rounded border border-stone-200 bg-white px-1 text-xs text-stone-700"
        defaultValue=""
      >
        <option value="">A</option>
        {TEXT_COLORS.map((c) => (
          <option key={c.name} value={c.value ?? ""}>
            {c.name}
          </option>
        ))}
      </select>

      {/* Highlight */}
      <select
        aria-label="Highlight color"
        title="Highlight color"
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) editor.chain().focus().unsetHighlight().run();
          else editor.chain().focus().setHighlight({ color: v }).run();
          e.target.selectedIndex = 0;
        }}
        className="h-8 rounded border border-stone-200 bg-white px-1 text-xs text-stone-700"
        defaultValue=""
      >
        <option value="">
          <Highlighter className="inline h-3 w-3" />
        </option>
        {HIGHLIGHT_COLORS.map((c) => (
          <option key={c.name} value={c.value ?? ""}>
            {c.name}
          </option>
        ))}
      </select>

      <Divider />

      {/* Lists, quote, hr */}
      <ToolButton
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Ordered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Blockquote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus className="h-4 w-4" />
      </ToolButton>

      <Divider />

      {/* Link */}
      <ToolButton
        title="Link"
        active={editor.isActive("link")}
        onClick={promptForLink}
      >
        <LinkIcon className="h-4 w-4" />
      </ToolButton>

      {/* Image */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFile}
      />
      <ToolButton
        title={uploadingImage ? "جاري الرفع..." : "إدراج صورة"}
        disabled={uploadingImage}
        onClick={() => imageInputRef.current?.click()}
      >
        {uploadingImage ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImageIcon className="h-4 w-4" />
        )}
      </ToolButton>

      <Divider />

      {/* Undo / Redo */}
      <ToolButton
        title="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        title="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="h-4 w-4" />
      </ToolButton>
    </div>
  );
};

export default EditorToolbar;
