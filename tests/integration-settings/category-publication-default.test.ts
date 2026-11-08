import test from "node:test";
import assert from "node:assert/strict";
import { categoryPublicationDisplayValue as visible } from "../../lib/dashboard/category-publication-default";
import { readFileSync } from "node:fs";

test("legacy categories show published and navigation-visible unless explicitly disabled", () => {
  for (const key of ["isActive", "navigationVisible"]) {
    assert.equal(visible("categories", key, undefined), true);
    assert.equal(visible("categories", key, null), true);
    assert.equal(visible("categories", key, false), false);
    assert.equal(visible("categories", key, true), true);
  }
});

test("category display defaults never leak into other settings and do not write values", () => {
  assert.equal(visible("campaigns", "isActive", undefined), undefined);
  assert.equal(visible("categories", "isFeatured", undefined), undefined);
  assert.equal(visible("categories", "navigationVisible", 0), 0);
  const editor = readFileSync("components/dashboard/content-editor/WorkspaceSettings.tsx", "utf8");
  assert.match(editor, /categoryPublicationDisplayValue\(kind, f\.key, settings\[f\.key\]\)/);
  assert.match(editor, /onChange\(f\.key, e\.target\.checked\)/);
});
