import test from "node:test";
import assert from "node:assert/strict";
import { publicProjectFilters, type ProjectFilterOption } from "../../lib/minbar/project-filter-options";
const labels = { gaza: "غزة", aqsa: "المسجد الأقصى", jerusalem: "القدس", zakat: "الزكاة", waqf: "الوقف", restoration: "الترميم", recurring: "التبرع الدوري" };
test("public filters follow the requested order and short localized names without changing URLs or the registry", () => {
  const row = (key: string, slug: string, kind: ProjectFilterOption["kind"] = "category"): ProjectFilterOption => ({ key, id: key, slug: "localized-" + slug, baseSlug: slug, kind, name: "CMS long name", order: 0, icon: "home", projectIds: ["project"], href: kind === "page" ? "/ar/" + slug : undefined });
  const rows = [
    row("page:ibadan", "ibadan-lana", "page"), row("page:restoration", "alquds-home-restoration", "page"),
    row("category:aqsa", "region-al-aqsa"), row("page:recurring", "type-recurring", "page"),
    row("category:jerusalem", "region-al-quds"), row("category:gaza", "region-gaza"),
    row("page:waqf", "type-waqf", "page"), row("page:zakat", "type-zakat", "page"),
  ];
  const before = structuredClone(rows);
  const result = publicProjectFilters(rows, labels);
  assert.deepEqual(result.map(item => item.name), Object.values(labels));
  assert.deepEqual(rows, before);
  for (const item of result) {
    const original = rows.find(row => row.key === item.key)!;
    assert.equal(item.href, original.href);
    assert.deepEqual(item.projectIds, original.projectIds);
  }
  assert.ok(rows.some(item => item.key === "page:ibadan"), "old hash resolution still has its original registry entry");
});
