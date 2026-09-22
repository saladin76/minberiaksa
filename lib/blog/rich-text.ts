export type ArticleBlock = {
  kind: "h2" | "p" | "li";
  text: string;
};

type TiptapNode = {
  type?: string;
  text?: string;
  attrs?: { level?: number };
  content?: TiptapNode[];
};

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(Number.parseInt(dec, 10))
    );
}

function cleanInline(value: string): string {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/(\*\*|__|~~|\*|_)/g, "")
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function htmlToBlocks(content: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  const pattern = /<(h[1-3]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;

  for (const match of content.matchAll(pattern)) {
    const tag = match[1].toLowerCase();
    const text = cleanInline(match[2]);
    if (!text) continue;
    blocks.push({
      kind: tag.startsWith("h") ? "h2" : tag === "li" ? "li" : "p",
      text,
    });
  }

  if (!blocks.length) {
    const fallback = cleanInline(content);
    if (fallback) blocks.push({ kind: "p", text: fallback });
  }
  return blocks;
}

function nodeText(node: TiptapNode): string {
  if (typeof node.text === "string") return node.text;
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(nodeText).join("");
}

function tiptapToBlocks(doc: TiptapNode): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  const visit = (node: TiptapNode, inheritedList = false) => {
    if (node.type === "heading") {
      const text = cleanInline(nodeText(node));
      if (text) blocks.push({ kind: "h2", text });
      return;
    }
    if (node.type === "paragraph") {
      const text = cleanInline(nodeText(node));
      if (text) blocks.push({ kind: inheritedList ? "li" : "p", text });
      return;
    }
    if (node.type === "listItem") {
      for (const child of node.content ?? []) visit(child, true);
      return;
    }
    for (const child of node.content ?? []) visit(child, inheritedList);
  };
  visit(doc);
  return blocks;
}

function markdownToBlocks(content: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];

  const flush = () => {
    const text = cleanInline(paragraph.join(" "));
    if (text) blocks.push({ kind: "p", text });
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      flush();
      blocks.push({ kind: "h2", text: cleanInline(heading[1]) });
      continue;
    }
    const listItem = line.match(/^[-*+]\s+(.+)$/);
    if (listItem) {
      flush();
      blocks.push({ kind: "li", text: cleanInline(listItem[1]) });
      continue;
    }
    const quote = line.match(/^>\s*(.+)$/);
    if (quote) {
      flush();
      blocks.push({ kind: "p", text: cleanInline(quote[1]) });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

export function contentToBlocks(content?: string | null): ArticleBlock[] {
  const value = content?.trim();
  if (!value) return [];

  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as TiptapNode;
      if (parsed?.type === "doc") return tiptapToBlocks(parsed);
    } catch {
      // Fall through.
    }
  }

  if (/<(?:h[1-3]|p|ul|ol|li)\b/i.test(value)) return htmlToBlocks(value);
  return markdownToBlocks(value);
}

export function contentToTiptapDocument(content?: string | null): TiptapNode {
  const value = content?.trim();
  if (!value) return { type: "doc", content: [{ type: "paragraph" }] };

  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as TiptapNode;
      if (parsed?.type === "doc") return parsed;
    } catch {
      // Convert legacy content below.
    }
  }

  const nodes: TiptapNode[] = contentToBlocks(value).map((block) => {
    const textNode = { type: "text", text: block.text };
    if (block.kind === "h2") {
      return { type: "heading", attrs: { level: 2 }, content: [textNode] };
    }
    if (block.kind === "li") {
      return {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [textNode] }],
          },
        ],
      };
    }
    return { type: "paragraph", content: [textNode] };
  });

  return { type: "doc", content: nodes.length ? nodes : [{ type: "paragraph" }] };
}

export function hasMeaningfulContent(content?: string | null): boolean {
  return contentToBlocks(content).some((block) => block.text.trim().length > 20);
}
