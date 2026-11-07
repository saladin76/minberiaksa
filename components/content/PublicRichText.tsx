import { createElement, type ReactNode } from "react";
import type { PublicRichNode } from "@/lib/content/public-rich-text";

function render(node: PublicRichNode, key: number): ReactNode {
  if (node.text !== undefined) return node.text;
  if (node.tag === "span") return createElement("span", { key }, node.children?.map(render));
  return createElement(node.tag, { key, ...(node.tag === "a" && node.href ? { href: node.href, rel: "noopener noreferrer" } : {}), ...(node.tag === "ol" && node.start ? { start: node.start } : {}) }, node.tag === "br" ? undefined : node.children?.map(render));
}
export function PublicRichText({ nodes }: { nodes: PublicRichNode[] }) {
  return <div className="public-rich-text space-y-4 [&_p]:leading-loose [&_p]:text-[var(--muted)] [&_ol]:list-decimal [&_ol]:ps-7 [&_ul]:list-disc [&_ul]:ps-7 [&_li]:my-2 [&_li_p]:m-0 [&_h2]:text-xl [&_h3]:text-lg [&_h4]:text-base [&_h2]:font-bold [&_h3]:font-bold [&_h4]:font-bold [&_strong]:font-bold [&_a]:underline [&_blockquote]:border-s-2 [&_blockquote]:ps-4">{nodes.map(render)}</div>;
}
