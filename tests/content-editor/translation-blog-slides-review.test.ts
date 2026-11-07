import test from "node:test";
import assert from "node:assert/strict";
import { reviewSlideTranslations, slidePersistenceIssues } from "../../app/(dashboard)/dashboard/slides/_components/translation-review";

const locales = ["en", "fr", "tr", "ur"] as const;

test("slide review distinguishes intentionally empty fallbacks from partly translated rows", () => {
  const draft = {
    title: "القدس", title_en: "Jerusalem", description_en: "Project",
    description_fr: "Description without title", buttonText_tr: "Donate",
    title_ur: "", description_ur: "",
  };
  assert.deepEqual(reviewSlideTranslations(draft, locales), {
    complete: ["en"], missing: ["ur"], incomplete: ["fr", "tr"],
  });
});

test("bulk save read-back catches missing or silently changed translation fields", () => {
  const draft = {
    title: "العنوان", description: "الوصف", image: "/hero.jpg",
    buttonText: "تبرع", buttonLink: "#quick_donate", showButton: true, isActive: false,
    title_en: "English", description_en: "Long copy", buttonText_en: "Donate",
    title_fr: "Français", description_fr: "", buttonText_fr: "",
  };
  const saved = {
    title: "العنوان", description: "الوصف", image: "/hero.jpg",
    buttonText: "تبرع", buttonLink: "#quick_donate", showButton: true, isActive: false,
    translations: [
      {locale: "en", title: "English", description: "Long copy", buttonText: "Donate"},
      {locale: "fr", title: "Français", description: "", buttonText: ""},
    ],
  };
  assert.deepEqual(slidePersistenceIssues(draft, saved, locales), []);
  assert.deepEqual(slidePersistenceIssues(draft, {
    ...saved, translations: saved.translations.filter(row => row.locale !== "fr"),
  }, locales), ["fr:missing"]);
  assert.deepEqual(slidePersistenceIssues(draft, {
    ...saved, translations: saved.translations.map(row => row.locale === "en"
      ? {...row, description: "Truncated"} : row),
  }, locales), ["en:description"]);
  assert.deepEqual(slidePersistenceIssues(draft, {...saved, image: "/wrong.jpg"}, locales), ["image"]);
});

test("a previously saved translation is not silently kept when a user explicitly clears all locale fields", () => {
  const draft = {
    title: "Arabic", showButton: false, isActive: false,
    title_en: "", description_en: "", buttonText_en: "",
  };
  const persisted = {
    title: "Arabic", showButton: false, isActive: false,
    translations: [{locale: "en", title: "Old translation"}],
  };
  assert.deepEqual(slidePersistenceIssues(draft, persisted, ["en"]), ["en:unexpected"]);
});

test("review does not modify article slugs, shared imagery, or arbitrary user input", () => {
  const draft = { title_en: "New", description_en: "", buttonText_en: "", slug: "existing-slug", image: "/existing.webp" };
  const before = structuredClone(draft);
  reviewSlideTranslations(draft, ["en"]);
  assert.deepEqual(draft, before);
});
