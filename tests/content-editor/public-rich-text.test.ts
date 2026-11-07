import test from "node:test";
import assert from "node:assert/strict";
import { publicRichText, type PublicRichNode } from "../../lib/content/public-rich-text";
const all = (nodes: PublicRichNode[]): PublicRichNode[] => nodes.flatMap(node => [node, ...all(node.children || [])]);
test("the public project retains two ordered lists, ten list items, H3 headings and bold CTA text", () => {
  const doc = { type: "doc", content: [
    { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "أهداف المشروع" }] },
    ...[1, 2].map(() => ({ type: "orderedList", attrs: { start: 1 }, content: Array.from({ length: 5 }, (_, i) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: `الهدف ${i + 1}`, marks: i === 0 ? [{ type: "bold" }] : [] }] }] })) })),
  ] };
  const nodes = all(publicRichText(JSON.stringify(doc)));
  assert.equal(nodes.filter(node => node.tag === "ol").length, 2);
  assert.equal(nodes.filter(node => node.tag === "li").length, 10);
  assert.equal(nodes.filter(node => node.tag === "strong").length, 2);
  assert.equal(nodes.filter(node => node.tag === "h3").length, 1);
});
test("legacy HTML retains its semantics and unsafe markup is rendered as neither scripts nor links", () => {
  const nodes = all(publicRichText('<h3>الهدف</h3><ol start="3"><li><strong>ساهم</strong></li></ol><script>alert(1)</script><p><a href="javascript:alert(1)">نص</a><a href="https://example.org/donate">تبرع</a></p>'));
  assert.equal(nodes.find(node => node.tag === "ol")?.start, 3);
  assert.equal(nodes.filter(node => node.tag === "strong").length, 1);
  assert.deepEqual(nodes.filter(node => node.href).map(node => node.href), ["https://example.org/donate"]);
  assert.doesNotMatch(JSON.stringify(nodes), /javascript|alert\(1\)/);
});
