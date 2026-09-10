import type { TReaderDocument } from "@usewaypoint/email-builder";

export type EmailDocument = TReaderDocument;

export type BlockType =
  | "Heading"
  | "Text"
  | "Button"
  | "Image"
  | "Avatar"
  | "Divider"
  | "Spacer"
  | "Html";

export interface AddableBlock {
  type: BlockType;
  label: string;
  description: string;
}

export const ADDABLE_BLOCKS: AddableBlock[] = [
  { type: "Heading", label: "عنوان", description: "نص بارز كرأس قسم" },
  { type: "Text", label: "نص", description: "فقرة عادية" },
  { type: "Button", label: "زر", description: "زر CTA قابل للنقر" },
  { type: "Image", label: "صورة", description: "صورة من رابط" },
  { type: "Avatar", label: "صورة دائرية", description: "Avatar / صورة مستديرة" },
  { type: "Divider", label: "فاصل", description: "خط أفقي" },
  { type: "Spacer", label: "مسافة", description: "مساحة فارغة" },
  { type: "Html", label: "HTML خام", description: "إدراج كود HTML مباشر" },
];

export const FONT_FAMILIES: { value: string; label: string }[] = [
  { value: "MODERN_SANS", label: "Modern Sans" },
  { value: "BOOK_SANS", label: "Book Sans" },
  { value: "ORGANIC_SANS", label: "Organic Sans" },
  { value: "GEOMETRIC_SANS", label: "Geometric Sans" },
  { value: "HEAVY_SANS", label: "Heavy Sans" },
  { value: "ROUNDED_SANS", label: "Rounded Sans" },
  { value: "MODERN_SERIF", label: "Modern Serif" },
  { value: "BOOK_SERIF", label: "Book Serif" },
  { value: "MONOSPACE", label: "Monospace" },
];

let blockCounter = 0;
export function newBlockId(prefix = "block"): string {
  blockCounter += 1;
  return `${prefix}-${Date.now()}-${blockCounter}`;
}

export function makeBlock(type: BlockType): { id: string; block: Record<string, unknown> } {
  const id = newBlockId(type.toLowerCase());
  switch (type) {
    case "Heading":
      return {
        id,
        block: {
          type: "Heading",
          data: {
            props: { text: "عنوان جديد", level: "h2" },
            style: {
              padding: { top: 16, bottom: 16, right: 24, left: 24 },
              textAlign: "right",
              color: "#1F2937",
              fontWeight: "bold",
            },
          },
        },
      };
    case "Text":
      return {
        id,
        block: {
          type: "Text",
          data: {
            props: { text: "اكتب نص الفقرة هنا. يمكنك إدراج {{user.name}} وغيرها." },
            style: {
              padding: { top: 8, bottom: 8, right: 24, left: 24 },
              fontWeight: "normal",
              fontSize: 16,
              textAlign: "right",
              color: "#374151",
            },
          },
        },
      };
    case "Button":
      return {
        id,
        block: {
          type: "Button",
          data: {
            props: {
              text: "اضغط هنا",
              url: "https://",
              buttonStyle: "rectangle",
              size: "medium",
              fullWidth: false,
              buttonBackgroundColor: "#FA5D17",
              buttonTextColor: "#FFFFFF",
            },
            style: {
              padding: { top: 16, bottom: 16, right: 24, left: 24 },
              fontSize: 14,
              fontWeight: "bold",
              textAlign: "center",
            },
          },
        },
      };
    case "Image":
      return {
        id,
        block: {
          type: "Image",
          data: {
            props: { url: "https://placehold.co/600x200", alt: "صورة", contentAlignment: "middle" },
            style: { padding: { top: 16, bottom: 16, right: 24, left: 24 } },
          },
        },
      };
    case "Avatar":
      return {
        id,
        block: {
          type: "Avatar",
          data: {
            props: {
              imageUrl: "https://placehold.co/96",
              alt: "Avatar",
              shape: "circle",
              size: 64,
            },
            style: {
              padding: { top: 16, bottom: 16, right: 24, left: 24 },
              textAlign: "center",
            },
          },
        },
      };
    case "Divider":
      return {
        id,
        block: {
          type: "Divider",
          data: {
            props: { lineColor: "#E5E7EB", lineHeight: 1 },
            style: {
              padding: { top: 12, bottom: 12, right: 24, left: 24 },
              backgroundColor: "transparent",
            },
          },
        },
      };
    case "Spacer":
      return {
        id,
        block: {
          type: "Spacer",
          data: { props: { height: 24 } },
        },
      };
    case "Html":
      return {
        id,
        block: {
          type: "Html",
          data: {
            props: { contents: "<p style=\"text-align:center\">HTML خام</p>" },
            style: {
              padding: { top: 8, bottom: 8, right: 24, left: 24 },
              color: "#374151",
              fontSize: 14,
            },
          },
        },
      };
  }
}

export function defaultDocument(): EmailDocument {
  const greetingId = newBlockId("heading");
  const bodyId = newBlockId("text");
  const ctaId = newBlockId("button");
  return {
    root: {
      type: "EmailLayout",
      data: {
        backdropColor: "#F8F8F8",
        canvasColor: "#FFFFFF",
        textColor: "#242424",
        fontFamily: "MODERN_SANS",
        childrenIds: [greetingId, bodyId, ctaId],
      },
    },
    [greetingId]: {
      type: "Heading",
      data: {
        props: { text: "مرحباً {{user.name}}", level: "h2" },
        style: {
          padding: { top: 24, bottom: 8, right: 24, left: 24 },
          textAlign: "right",
        },
      },
    },
    [bodyId]: {
      type: "Text",
      data: {
        props: {
          text: "شكراً لدعمك. لقد تبرعت بإجمالي {{totals.amountUSD}} USD عبر {{totals.count}} تبرع.",
        },
        style: {
          padding: { top: 8, bottom: 16, right: 24, left: 24 },
          textAlign: "right",
        },
      },
    },
    [ctaId]: {
      type: "Button",
      data: {
        props: { text: "زيارة الموقع", url: "https://minberiaksa.org", buttonStyle: "rectangle" },
        style: {
          padding: { top: 8, bottom: 32, right: 24, left: 24 },
          backgroundColor: "#FA5D17",
          color: "#FFFFFF",
        },
      },
    },
  } as EmailDocument;
}

export function getRoot(doc: EmailDocument): {
  childrenIds: string[];
  data: Record<string, unknown>;
} {
  const root = doc.root as { data: { childrenIds?: string[] } & Record<string, unknown> };
  return {
    childrenIds: root.data?.childrenIds ?? [],
    data: root.data,
  };
}

export function setRootChildren(
  doc: EmailDocument,
  childrenIds: string[]
): EmailDocument {
  const next = { ...doc } as Record<string, unknown>;
  const root = (next.root as { data: Record<string, unknown> }) ?? { data: {} };
  next.root = {
    ...(root as object),
    data: { ...(root.data as object), childrenIds },
  };
  return next as EmailDocument;
}

export function getBlock(
  doc: EmailDocument,
  id: string
): { type: string; data: { props?: Record<string, unknown>; style?: Record<string, unknown> } } | null {
  const blk = (doc as Record<string, unknown>)[id];
  if (!blk || typeof blk !== "object") return null;
  return blk as {
    type: string;
    data: { props?: Record<string, unknown>; style?: Record<string, unknown> };
  };
}

export function setBlock(
  doc: EmailDocument,
  id: string,
  block: Record<string, unknown>
): EmailDocument {
  return { ...(doc as Record<string, unknown>), [id]: block } as EmailDocument;
}

export function deleteBlock(doc: EmailDocument, id: string): EmailDocument {
  const next = { ...(doc as Record<string, unknown>) };
  delete next[id];
  const root = getRoot(next as EmailDocument);
  return setRootChildren(
    next as EmailDocument,
    root.childrenIds.filter((cid) => cid !== id)
  );
}
