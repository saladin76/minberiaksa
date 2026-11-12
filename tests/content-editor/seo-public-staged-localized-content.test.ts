import assert from "node:assert/strict";
import test from "node:test";
import { exactPublishedLocaleSlug, exactLanguageSwitchTarget } from "../../lib/minbar/staged-localized-content";

const base = {
  entityId: "stable-project-42",
  baseSlug: "خبز-غزة",
  translations: [
    { locale: "en", slug: "gaza-bread" },
    { locale: "tr", slug: "gazze-ekmegi" },
    { locale: "fr", slug: "pain-a-gaza" },
  ],
  availableLocales: ["ar", "en", "tr"],
} as const;

test("published locale requires exact slug and publication eligibility", () => {
  assert.equal(exactPublishedLocaleSlug({ ...base, locale: "ar" }), "خبز-غزة");
  assert.equal(exactPublishedLocaleSlug({ ...base, locale: "en" }), "gaza-bread");
  assert.equal(exactPublishedLocaleSlug({ ...base, locale: "tr" }), "gazze-ekmegi");
  assert.equal(exactPublishedLocaleSlug({ ...base, locale: "fr" }), null);
});

test("no fallback to English slug when translation missing", () => {
  assert.equal(exactPublishedLocaleSlug({
    ...base, locale: "de", availableLocales: ["de", "ar", "en"],
  }), null);
});

test("language switching preserves stable entity identity", () => {
  assert.deepEqual(
    exactLanguageSwitchTarget({ ...base, locale: "en" }, "/en/donate"),
    { entityId: "stable-project-42", path: "/en/donate/gaza-bread" },
  );
  assert.equal(exactLanguageSwitchTarget({ ...base, locale: "fr" }, "/fr/faire-un-don"), null);
  assert.equal(exactLanguageSwitchTarget({ ...base, locale: "en" }, "/fr/faire-un-don"), null);
  assert.equal(exactLanguageSwitchTarget({ ...base, locale: "en" }, null), null);
});

test("unsafe or empty local slugs never become public URLs", () => {
  for (const slug of ["", "../admin", "x/y", "%2Fadmin", "foo?token=1"]) {
    assert.equal(exactPublishedLocaleSlug({
      ...base, locale: "en", translations: [{ locale: "en", slug }],
    }), null);
  }
});
