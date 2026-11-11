import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_ROUTE_PROPOSALS,
  StagedPublicUrlRegistry,
  normalizePublicPath,
  type RouteProposal,
  type LocalizedContentSlug,
  type HistoricAlias,
} from "../../lib/minbar/staged-public-url-registry";

const approved: RouteProposal[] = [
  { locale: "ar", route: "projects", slug: "المشاريع", status: "approved" },
  { locale: "en", route: "projects", slug: "donate", status: "approved" },
  { locale: "tr", route: "projects", slug: "bagislar", status: "approved" },
  { locale: "fr", route: "projects", slug: "faire-un-don", status: "approved" },
];

const translations: LocalizedContentSlug[] = [
  { type: "project", entityId: "project-123", locale: "ar", slug: "خبز-غزة", published: true, indexable: true },
  { type: "project", entityId: "project-123", locale: "en", slug: "gaza-bread", published: true, indexable: true },
  { type: "project", entityId: "project-123", locale: "tr", slug: "gazze-ekmek", published: true, indexable: true },
  { type: "project", entityId: "project-123", locale: "fr", slug: "pain-gaza", published: false, indexable: false },
];

const aliases: HistoricAlias[] = [
  { type: "project", entityId: "project-123", locale: "ar", path: "/ar/bagislar/gaza-bread" },
  { type: "project", entityId: "project-123", locale: "en", path: "/en/bagislar/gaza-bread" },
];

test("migration candidates never activate public routes", () => {
  const registry = new StagedPublicUrlRegistry(INITIAL_ROUTE_PROPOSALS);
  assert.equal(registry.routePath("projects", "ar"), null);
  assert.equal(registry.routePath("projects", "fr"), null);
  assert.equal(registry.resolveAlias("/ar/bagislar/gaza-bread"), null);
});

test("approved routes map language and stable project identity independently of legacy slugs", () => {
  const registry = new StagedPublicUrlRegistry(approved, translations, aliases);
  assert.equal(registry.routePath("projects", "ar"), "/ar/%D8%A7%D9%84%D9%85%D8%B4%D8%A7%D8%B1%D9%8A%D8%B9");
  assert.equal(registry.routePath("projects", "tr"), "/tr/bagislar");
  assert.equal(registry.contentPath("project", "project-123", "en"), "/en/donate/gaza-bread");
  assert.equal(registry.switchContentLocale("project", "project-123", "tr"), "/tr/bagislar/gazze-ekmek");
  assert.equal(registry.switchContentLocale("project", "project-123", "fr"), null);
  assert.equal(registry.resolveAlias("/ar/bagislar/gaza-bread"), registry.contentPath("project", "project-123", "ar"));
  assert.equal(registry.resolveAlias("/en/bagislar/gaza-bread"), "/en/donate/gaza-bread");
  assert.equal(registry.resolveAlias("/en/bagislar/not-registered"), null);
});

test("duplicate project slug in same locale is a blocking collision", () => {
  assert.throws(() => new StagedPublicUrlRegistry(approved, [
    ...translations,
    { type: "project", entityId: "other-id", locale: "en", slug: "gaza-bread", published: true, indexable: true },
  ]), /PUBLIC_ROUTE_COLLISION/);
});

test("two locale-specific static route keys cannot own the same URL", () => {
  assert.throws(() => new StagedPublicUrlRegistry([
    ...approved,
    { locale: "ar", route: "contact", slug: "المشاريع", status: "approved" },
  ]), /PUBLIC_ROUTE_COLLISION/);
});

test("aliases never silently change content owner", () => {
  assert.throws(() => new StagedPublicUrlRegistry(approved, translations, [
    ...aliases,
    { type: "project", entityId: "another-project", locale: "ar", path: "/ar/bagislar/gaza-bread" },
  ]), /ALIAS_OWNERSHIP_CONFLICT/);
});

test("missing or unpublished translations never receive a canonical URL", () => {
  const registry = new StagedPublicUrlRegistry(approved, translations);
  assert.equal(registry.contentPath("project", "not-present", "ar"), null);
  assert.equal(registry.contentPath("project", "project-123", "fr"), null);
  assert.equal(registry.contentPath("category", "project-123", "ar"), null);
});

test("encoded unicode aliases normalize consistently while unsafe paths fail", () => {
  assert.equal(normalizePublicPath("/ar/%D8%A7%D9%84%D9%85%D8%B4%D8%A7%D8%B1%D9%8A%D8%B9/"), "/ar/المشاريع");
  for (const path of [
    "//evil.example/path",
    "/ar/bagislar/%2Fadmin",
    "/ar/bagislar/%5cadmin",
    "/ar/bagislar/%252fadmin",
    "/ar/bagislar/%252e%252e/admin",
    "/ar/bagislar/../admin",
    "/ar/bagislar?a=1",
    "/ar/bagislar#fragment",
  ]) {
    assert.throws(() => normalizePublicPath(path));
  }
});


test("alias audit identifies unpublished targets without inventing destinations", () => {
  const registry = new StagedPublicUrlRegistry(approved, translations, [
    ...aliases,
    { type: "project", entityId: "project-123", locale: "fr", path: "/fr/bagislar/pain-gaza" },
  ]);
  assert.deepEqual(registry.auditAliasTargets(), {
    checked: 3,
    unresolved: ["/fr/bagislar/pain-gaza"],
    selfReferential: [],
  });
});

test("alias audit flags a canonical URL mistakenly registered as a legacy alias", () => {
  const registry = new StagedPublicUrlRegistry(approved, translations, [
    { type: "project", entityId: "project-123", locale: "en", path: "/en/donate/gaza-bread" },
  ]);
  assert.deepEqual(registry.auditAliasTargets(), {
    checked: 1,
    unresolved: [],
    selfReferential: ["/en/donate/gaza-bread"],
  });
  assert.equal(registry.resolveAlias("/en/donate/gaza-bread"), null);
});
