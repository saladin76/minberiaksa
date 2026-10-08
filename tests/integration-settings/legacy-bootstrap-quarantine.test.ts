import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("inherited cross-project bootstrap cannot run on pushes, access secrets or deploy", () => {
  const workflow = readFileSync(".github/workflows/bootstrap-integration-settings-vercel.yml", "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*(push|pull_request|pull_request_target|schedule):/m);
  assert.doesNotMatch(workflow, /secrets\.|\$\{\{|VERCEL_TOKEN|VERCEL_PROJECT_ID|gh pr comment|vercel (deploy|pull|promote)/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /No bootstrap or deployment is performed/);
});
