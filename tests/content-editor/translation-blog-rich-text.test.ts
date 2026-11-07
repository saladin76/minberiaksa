import test from "node:test";
import assert from "node:assert/strict";
import { contentToTiptapDocument } from "../../lib/blog/rich-text";

test("existing multilingual rich content retains headings, paragraphs, marks, links and embedded pictures", () => {
  const source = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Aid for families" }] },
      { type: "paragraph", content: [
        { type: "text", text: "Support " },
        { type: "text", text: "families", marks: [
          { type: "bold" },
          { type: "link", attrs: { href: "https://example.org/appeal?locale=en", target: "_blank" } },
        ] },
      ] },
      { type: "image", attrs: { src: "/uploads/unique-en.webp", alt: "Families receiving supplies" } },
      { type: "paragraph", content: [{ type: "text", text: "Second separate paragraph." }] },
    ],
  };
  assert.deepEqual(contentToTiptapDocument(JSON.stringify(source)), source);
});

test("switching a locale between rich drafts does not flatten or reuse the wrong image", () => {
  const source = { type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "الفقرة الأولى" }] },
    { type: "paragraph", content: [{ type: "text", text: "الفقرة الثانية" }] },
    { type: "image", attrs: {src: "/unique-ar.webp"} },
  ] };
  const translated = { type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "First paragraph" }] },
    { type: "paragraph", content: [{ type: "text", text: "Second paragraph" }] },
    { type: "image", attrs: {src: "/unique-en.webp"} },
  ] };
  assert.deepEqual(contentToTiptapDocument(JSON.stringify(source)), source);
  assert.deepEqual(contentToTiptapDocument(JSON.stringify(translated)), translated);
});

test("invalid editor input yields a safe document rather than losing an entire saved article", () => {
  const doc = contentToTiptapDocument("{broken json");
  assert.equal(doc.type, "doc");
  assert.ok(Array.isArray(doc.content));
});
