import test from "node:test";
import assert from "node:assert/strict";
import { preparePublicPreviewFrame } from "../../lib/content-editor/preview-frame";
import { LOCALE_FONT_STYLESHEETS } from "../../lib/locale-fonts";

function documentFixture(variables: Record<string, string>, sheets: string[] = []) {
  const properties = new Map(Object.entries(variables));
  const nodes: Array<{ value: string; remove: () => void; cloneNode: () => unknown; setAttribute: () => void }> = [];
  const node = (value: string) => ({ value, setAttribute() {}, remove() { nodes.splice(nodes.indexOf(this), 1); }, cloneNode() { return node(value); } });
  for (const sheet of sheets) nodes.push(node(sheet));
  return {
    documentElement: { className: "site-fonts", lang: "ar", dir: "rtl" },
    body: { style: { ...Object.keys(variables), [Symbol.iterator]: () => properties.keys(), getPropertyValue: (key: string) => properties.get(key) ?? "", setProperty: (key: string, value: string) => properties.set(key, value), margin: "" } },
    head: { querySelectorAll: () => [...nodes], appendChild: (child: typeof nodes[number]) => nodes.push(child) },
    createElement: () => ({ rel: "", href: "", setAttribute() {} }), nodes, properties,
  };
}
test("preview inherits the same body font variables and CSS without importing dashboard layout styles", () => {
  const source = documentFixture({ "--font-poppins": "'Poppins'", "--font-cairo": "'Cairo'", background: "dashboard-only" }, ["public.css", "fonts.css"]);
  const target = documentFixture({}, ["stale.css"]);
  preparePublicPreviewFrame(source as unknown as Document, target as unknown as Document, "fr");
  assert.equal(target.properties.get("--font-poppins"), "'Poppins'");
  assert.equal(target.properties.get("--font-cairo"), "'Cairo'"); assert.equal(target.properties.has("background"), false);
  assert.equal(target.documentElement.lang, "fr"); assert.equal(target.documentElement.dir, "ltr");
  assert.deepEqual(target.nodes.map(node => node.value), ["public.css", "fonts.css"]);
  preparePublicPreviewFrame(source as unknown as Document, target as unknown as Document, "ur");
  assert.equal(target.documentElement.dir, "rtl"); assert.equal(target.nodes.length, 2);
});
test("Japanese, Chinese and Hindi previews load their public locale stylesheet", () => {
  for (const locale of ["ja", "zh", "hi"]) {
    const source = documentFixture({}, []), target = documentFixture({}, []);
    preparePublicPreviewFrame(source as unknown as Document, target as unknown as Document, locale);
    assert.equal((target.nodes[0] as unknown as { href: string }).href, LOCALE_FONT_STYLESHEETS[locale]);
  }
});
