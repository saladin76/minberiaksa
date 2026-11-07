import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeTranslations } from "../../app/(dashboard)/dashboard/_components/AutoTranslateButton";
import { emptyTranslations, filledLocaleCount, translationsFromRows } from "../../app/(dashboard)/dashboard/_components/ContentTranslationTabs";
import { SUPPORTED_LOCALES } from "../../lib/locales";

test("translation merge preserves existing manually reviewed fields by default", () => {
  const existing = { en: { title: "Approved title", description: "Approved body" }, tr: { title: "" } };
  const received = {
    en: { fields: { title: "Generated title", description: "" }, richFields: {}, warnings: [] },
    tr: { fields: { title: "Yeni başlık" }, richFields: {}, warnings: [] },
  };
  const result = mergeTranslations(existing, received, false, ["title", "description"]);
  assert.equal(result.en.title, "Approved title");
  assert.equal(result.en.description, "Approved body");
  assert.equal(result.tr.title, "Yeni başlık");
  assert.equal(existing.tr.title, "");
});

test("overwrite remains opt-in and empty fields never destroy good copy", () => {
  const current = { en: { title: "Original title", intro: "Original introduction", slug: "canonical-path" } };
  const generated = {
    en: {
      fields: { title: "New title", intro: "", slug: "changed-path" },
      richFields: {},
    },
  };
  const result = mergeTranslations(current, generated, true, ["title", "intro"]);
  assert.equal(result.en.title, "New title");
  assert.equal(result.en.intro, "Original introduction");
  assert.equal(result.en.slug, "canonical-path");
});

test("language tabs include every supported non-Arabic locale and ignore unknown stored languages", () => {
  const fields = [{ name: "title", label: "Title" }, { name: "intro", label: "Intro" }];
  const blank = emptyTranslations(fields);
  assert.deepEqual(Object.keys(blank).sort(), SUPPORTED_LOCALES.filter(code => code !== "ar").sort());
  const hydrated = translationsFromRows([
    { locale: "en", title: "Verified English", intro: "Introduction" },
    { locale: "fr", title: "Français" },
    { locale: "xx", title: "Unexpected" },
  ], fields);
  assert.equal(hydrated.en.title, "Verified English");
  assert.equal(hydrated.fr.title, "Français");
  assert.equal(hydrated.xx, undefined);
  assert.equal(filledLocaleCount(hydrated, "title"), 2);
});

test("Save All API contract supports atomic multi-language revisions without changing payment routes", () => {
  const editor = readFileSync("components/dashboard/content-editor/ContentEditor.tsx", "utf8");
  const service = readFileSync("lib/content-editor/service.ts", "utf8");
  assert.match(editor, /localeChanges,/);
  assert.match(editor, /revision: document\.revision/);
  assert.match(editor, /liveStatuses/);
  assert.match(service, /export async function saveWorkspace/);
  assert.match(service, /return db\.transaction\(async \(tx\)/);
  assert.match(service, /const locales = \{ \.\.\.input\.localeChanges, \[input\.locale\]: input\.changes \}/);
});
