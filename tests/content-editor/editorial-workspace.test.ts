import assert from "node:assert/strict";
import test from "node:test";
import { groupEditorialJobs } from "../../lib/content-editor/editorial-view";
import { isUnifiedContentEditorPath } from "../../lib/content-editor/editor-routes";

test("locale work is grouped by article identity without losing independently actionable jobs", () => {
  const jobs = [{id:"en",sourceId:"article-one"},{id:"tr",sourceId:"article-one"},{id:"other",sourceId:"article-two"},{id:"weekly"}];
  const groups = groupEditorialJobs(jobs);
  assert.deepEqual(groups.map(group => group.jobs.map(job => job.id)), [["en","tr"],["other"],["weekly"]]);
  assert.equal(groups.flatMap(group => group.jobs).length, jobs.length);
});
test("an applied article and its translations share one article group", () => {
  const groups = groupEditorialJobs([{id:"proposal",resultContentId:"article"},{id:"translation",sourceId:"article"}]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].jobs.length, 2);
});
test("the unified editor excludes legacy injected tools while lists and advanced settings remain distinct", () => {
  for (const path of ["/dashboard/blog/create", "/dashboard/blog/create/article", "/dashboard/campaigns/edit/project", "/dashboard/campaigns/new", "/dashboard/content/reports/report", "/dashboard/campaigns/project/seo"]) assert.equal(isUnifiedContentEditorPath(path), true, path);
  for (const path of ["/dashboard/blog", "/dashboard/campaigns", "/dashboard/blog/settings/article", "/dashboard/campaigns/settings/project", "/ar/blog/article"]) assert.equal(isUnifiedContentEditorPath(path), false, path);
});
